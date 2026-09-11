import { type Calendar } from "@core/types/calendar.contracts";
import {
  type ProviderKind,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  calendarProviderKind,
  connectionProviderKind,
} from "@web/auth/providers/connection-provider.util";
import { isCalendarReconnectRequired } from "@web/auth/providers/reconnect.calendar";

export function getLocalCalendar(calendars: Calendar[]): Calendar | undefined {
  return calendars.find((calendar) => calendar.provider === "local");
}

export interface GetWritableCalendarsOptions {
  /**
   * True once any account is connected. The local calendar then drops out of
   * the writable set - a connected user's events belong on a provider
   * calendar, and this is the prerequisite that makes it safe to stop
   * rendering the local calendar's sidebar row (see
   * local-calendar-visibility LCV2/LCV3). Derive this from connection state
   * (e.g. useConnectedAccountEmails().length > 0), never from calendar rows:
   * a just-disconnected account's Google calendars can still be present for
   * a retention window after the connection itself is gone.
   */
  hasConnectedAccount?: boolean;
  /**
   * Account keys (`provider:email`) that currently need reconnect. Their
   * calendars stay visible on the grid as read-only but must not be offered
   * as create targets. Email-only values still match for older callers.
   * Defaults to the session reconnect-required set.
   */
  reconnectRequiredEmails?: ReadonlySet<string> | readonly string[];
}

const toEmailSet = (
  emails: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> | null => {
  if (!emails) return null;
  return new Set(
    [...emails].map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
};

const calendarNeedsReconnect = (
  calendar: Calendar,
  reconnectRequiredEmails: ReadonlySet<string> | null,
): boolean => {
  if (!calendar.accountEmail) return false;
  const email = calendar.accountEmail.toLowerCase();
  const provider = calendarProviderKind(calendar);
  if (reconnectRequiredEmails) {
    const keyed = provider
      ? reconnectRequiredEmails.has(`${provider}:${email}`)
      : false;
    return (
      keyed ||
      reconnectRequiredEmails.has(email) ||
      isCalendarReconnectRequired(calendar)
    );
  }
  return isCalendarReconnectRequired(calendar);
};

/**
 * Calendars offered as a create target: a reader/freeBusy-only calendar
 * would silently fail to accept a new event. Shared by the event form's
 * picker and the Settings default-calendar picker, which offer the same set
 * for the same reason.
 */
export function getWritableCalendars(
  calendars: Calendar[],
  options: GetWritableCalendarsOptions = {},
): Calendar[] {
  const { hasConnectedAccount = false } = options;
  const reconnectRequiredEmails = toEmailSet(options.reconnectRequiredEmails);

  return calendars.filter(
    (calendar) =>
      calendar.isActive &&
      calendar.capabilities.canWrite &&
      !calendarNeedsReconnect(calendar, reconnectRequiredEmails) &&
      (!hasConnectedAccount || calendar.provider !== "local"),
  );
}

/**
 * The one order every calendar surface shows: by account in connection order,
 * then that account's primary first, then alphabetically. A calendar with no
 * account (the local one) or an account that isn't connected sorts last.
 *
 * Shared so the sidebar list, the Settings default-calendar picker and the
 * event form's picker can't drift - they did, when each had its own
 * comparator claiming to mirror the others.
 */
export function compareCalendars(
  accountEmailOrder: readonly string[],
): (a: Calendar, b: Calendar) => number {
  const accountRank = (calendar: Calendar): number => {
    const index = calendar.accountEmail
      ? accountEmailOrder.indexOf(calendar.accountEmail)
      : -1;
    return index === -1 ? accountEmailOrder.length : index;
  };

  return (a, b) => {
    const byAccount = accountRank(a) - accountRank(b);
    if (byAccount !== 0) return byAccount;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
}

/**
 * True when these calendars span more than one account, so naming the account
 * on a row tells the user something. With one account every row would say the
 * same thing.
 */
export function spansMultipleAccounts(calendars: Calendar[]): boolean {
  return (
    new Set(calendars.map((calendar) => calendar.accountEmail).filter(Boolean))
      .size > 1
  );
}

/**
 * The web app's identity for one connected account: provider + email. An
 * email alone is not enough, since the same address can be a Google account
 * and a Microsoft account, and both `Calendar` and `SyncConnectionSummary`
 * already carry `provider` next to `accountEmail`.
 */
export interface AccountRef {
  provider: ProviderKind;
  accountEmail: string;
}

/** String form, for React keys, DOM ids, collapse state, and page-jump ids. */
export const accountKey = ({ provider, accountEmail }: AccountRef): string =>
  `${provider}:${accountEmail}`;

/** Human form: "ahab@pequod.com (Google)". */
export const accountLabel = ({ provider, accountEmail }: AccountRef): string =>
  `${accountEmail} (${providerDisplayName(provider)})`;

/** Undefined when the connection reported no email. */
export const connectionAccount = (
  connection: Pick<SyncConnectionSummary, "provider" | "accountEmail">,
): AccountRef | undefined =>
  connection.accountEmail
    ? {
        provider: connectionProviderKind(connection),
        accountEmail: connection.accountEmail,
      }
    : undefined;

/** Undefined for the local calendar and for accounts that reported no email. */
export const calendarAccount = (
  calendar: Pick<Calendar, "provider" | "accountEmail">,
): AccountRef | undefined => {
  const provider = calendarProviderKind(calendar);
  return provider && calendar.accountEmail
    ? { provider, accountEmail: calendar.accountEmail }
    : undefined;
};

export interface AccountGroup extends AccountRef {
  connection: SyncConnectionSummary | undefined;
  calendars: Calendar[];
}

/**
 * Bucket calendars by the account (provider + email) they belong to, in
 * connection order, with anything lacking an account (the local calendar)
 * left ungrouped. Empty groups are kept so a connected-but-still-importing
 * account still renders its section header. Callers that cannot show an
 * empty optgroup (the Settings default-calendar select) skip those groups
 * inline.
 *
 * When `compassEmail` matches a group's account email (case-insensitive),
 * nest the local Compass calendar under that section instead of leaving it
 * ungrouped. Callers that paint a second "Compass email" parent then only
 * do so when no connected account shares the login address.
 */
export function groupCalendarsByAccount(
  calendars: Calendar[],
  connections: SyncConnectionSummary[],
  compassEmail?: string | null,
): { groups: AccountGroup[]; ungrouped: Calendar[] } {
  const groups: AccountGroup[] = [];
  const byKey = new Map<string, AccountGroup>();
  const ungrouped: Calendar[] = [];
  const ensureGroup = (
    account: AccountRef,
    connection: SyncConnectionSummary | undefined,
  ): AccountGroup => {
    const key = accountKey(account);
    let group = byKey.get(key);
    if (!group) {
      group = { ...account, connection, calendars: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    return group;
  };

  // Seed in connection order so accounts appear oldest-connected first,
  // regardless of the order calendars came back in.
  for (const connection of connections) {
    const account = connectionAccount(connection);
    if (account) ensureGroup(account, connection);
  }

  for (const calendar of calendars) {
    const account = calendarAccount(calendar);
    if (!account) {
      ungrouped.push(calendar);
      continue;
    }
    // A calendar whose account has no connection summary yet (metadata and
    // the calendar list can load a moment apart) still gets a section.
    ensureGroup(account, undefined).calendars.push(calendar);
  }

  return nestLocalCalendarInMatchingGroup(groups, ungrouped, compassEmail);
}

const nestLocalCalendarInMatchingGroup = (
  groups: AccountGroup[],
  ungrouped: Calendar[],
  compassEmail: string | null | undefined,
): { groups: AccountGroup[]; ungrouped: Calendar[] } => {
  const normalizedCompassEmail = compassEmail?.trim().toLowerCase();
  if (!normalizedCompassEmail) return { groups, ungrouped };

  // Connection order is already the group order; when accounts on two
  // providers share the login email, the oldest-connected one wins.
  const matchingGroup = groups.find(
    (group) =>
      group.accountEmail.trim().toLowerCase() === normalizedCompassEmail,
  );
  if (!matchingGroup) return { groups, ungrouped };

  const stillUngrouped: Calendar[] = [];
  for (const calendar of ungrouped) {
    if (calendar.provider === "local") {
      matchingGroup.calendars.push(calendar);
    } else {
      stillUngrouped.push(calendar);
    }
  }

  return { groups, ungrouped: stillUngrouped };
};

export interface DefaultTargetCalendarOptions {
  /**
   * The calendar the user chose as their default in Settings. Ignored when it
   * names a calendar that is gone or no longer writable, so a stale
   * preference degrades to the derived default instead of breaking event
   * creation.
   */
  preferredCalendarId?: string | null;
  /**
   * Connected account emails in connection order. With two accounts, both
   * have a primary calendar, so "first primary wins" would pick whichever
   * happened to sort first; this makes the oldest-connected account win.
   */
  accountEmailOrder?: readonly string[];
  /**
   * Account emails that currently need Google reconnect. Preferred/default
   * calendars on those accounts are skipped so creates land on a healthy
   * account instead. Defaults to the session reconnect-required set.
   */
  reconnectRequiredEmails?: ReadonlySet<string> | readonly string[];
}

const isWritableProviderCalendar = (
  calendar: Calendar,
  reconnectRequiredEmails: ReadonlySet<string> | null,
): boolean =>
  calendar.provider !== "local" &&
  calendar.capabilities.canWrite &&
  !calendarNeedsReconnect(calendar, reconnectRequiredEmails);

/** True when the write path can deliver a guest list for this calendar. */
export const canInviteOnCalendar = (calendar: Calendar | undefined): boolean =>
  Boolean(
    calendar?.capabilities.canInviteAttendees && calendar.capabilities.canWrite,
  );

/**
 * Where a new event lands: the user's chosen default if it is still usable,
 * else the primary calendar of the oldest-connected account, else the local
 * calendar while disconnected (anonymous / no connected account). Once any
 * account is connected, local is never the create target - matching the
 * writable picker and day-view column filter.
 */
export function getDefaultTargetCalendar(
  calendars: Calendar[],
  options: DefaultTargetCalendarOptions = {},
): Calendar | undefined {
  const { preferredCalendarId, accountEmailOrder = [] } = options;
  const reconnectRequiredEmails = toEmailSet(options.reconnectRequiredEmails);
  // Same connection gate as getWritableCalendars / sidebar LCV3: once any
  // account is connected, new events belong on a provider calendar. A stale
  // local preference (or local fallback) would otherwise open drafts that day
  // view no longer has a column for.
  const hasConnectedAccount = accountEmailOrder.length > 0;

  const preferred = preferredCalendarId
    ? calendars.find((calendar) => calendar.id === preferredCalendarId)
    : undefined;
  // The local calendar is a valid explicit choice while disconnected, even
  // though it is not a writable provider calendar.
  if (
    preferred?.capabilities.canWrite &&
    !calendarNeedsReconnect(preferred, reconnectRequiredEmails) &&
    (!hasConnectedAccount || preferred.provider !== "local")
  ) {
    return preferred;
  }

  const primaries = calendars.filter(
    (calendar) =>
      calendar.isPrimary &&
      isWritableProviderCalendar(calendar, reconnectRequiredEmails),
  );
  const byConnectionOrder = accountEmailOrder
    .map((email) =>
      primaries.find((calendar) => calendar.accountEmail === email),
    )
    .find(Boolean);

  return (
    byConnectionOrder ??
    primaries[0] ??
    (hasConnectedAccount ? undefined : getLocalCalendar(calendars))
  );
}
