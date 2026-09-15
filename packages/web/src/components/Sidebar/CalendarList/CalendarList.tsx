import { type FC, useCallback, useMemo } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { normalizeEmail } from "@core/util/email.util";
import { shouldShowContextualLoadError } from "@web/api/util/api.util";
import { useSession } from "@web/auth/compass/session/useSession";
import { useUser } from "@web/auth/compass/user/hooks/useUser";
import { useAvailableConnectProviders } from "@web/auth/providers/useAvailableConnectProviders";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import {
  accountKey,
  accountLabel,
  compareCalendars,
  emailsSharedAcrossProviders,
  groupCalendarsByAccount,
} from "@web/calendars/calendar.util";
import {
  accountCalendarListId,
  useCollapsedAccountKeys,
} from "@web/calendars/collapsed-accounts.store";
import { useCalendarVisibility } from "@web/calendars/useCalendarVisibility";
import { useConnectedAccountEmails } from "@web/calendars/useDefaultTargetCalendar";
import { CalendarDigitListSection } from "@web/components/Sidebar/CalendarList/CalendarDigitListSection";
import {
  CalendarRow,
  calendarRowDisplayName,
} from "@web/components/Sidebar/CalendarList/CalendarRow";
import { useCalendarDigitPick } from "@web/components/Sidebar/CalendarList/useCalendarDigitPick";
import {
  calendarAccountJumpId,
  pageJumpAttrs,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { AccountSectionHeader } from "./AccountSectionHeader";
import { AnonymousCalendarRow } from "./AnonymousCalendarRow";
import { CalendarListHeader } from "./CalendarListHeader";

export const CalendarList: FC = () => {
  const { authenticated } = useSession();
  const { email } = useUser();
  const availableProviders = useAvailableConnectProviders();
  const connections = useUserMetadataStore(selectSyncConnections);
  const { data, error, isPending, isError, refetch } = useCalendarsQuery();
  const { toggleCalendarVisibility, announcement } = useCalendarVisibility();
  const accountEmailOrder = useConnectedAccountEmails();
  const collapsedKeys = useCollapsedAccountKeys();

  const isAnonymous = !email;
  // CalendarListHeader renders a working connect button under exactly this
  // condition, so the empty-state text below would only restate the problem
  // directly beneath the control that solves it.
  const showConnectCta =
    authenticated && connections.length === 0 && availableProviders.length > 0;
  // Session expiry already surfaces SessionExpiredToast — don't also show
  // "Couldn't load calendars" / Retry (or a false empty-list story) for it.
  const showCalendarsLoadError = shouldShowContextualLoadError(isError, error);
  const hideCalendarsBody = isPending || (isError && !showCalendarsLoadError);

  // Re-groups on every calendar-visibility/collapse toggle otherwise, since
  // those live in sibling external stores this component also subscribes to.
  const calendars = useMemo(
    () =>
      (data ?? [])
        .filter((calendar) => calendar.isActive)
        .sort(compareCalendars(accountEmailOrder)),
    [data, accountEmailOrder],
  );
  const { groups, ungrouped } = useMemo(
    () => groupCalendarsByAccount(calendars, connections, email),
    [calendars, connections, email],
  );
  const sharedEmails = emailsSharedAcrossProviders(groups);

  const handleToggle = useCallback(
    (calendar: Calendar, displayName: string) => {
      toggleCalendarVisibility(calendar.id, !calendar.isVisible, displayName);
    },
    [toggleCalendarVisibility],
  );

  // No connected accounts: the single "Calendar list" page-jump target is
  // this outer section. Digit pick lives here so Mod+digit then 1..9 still
  // toggles after landing on that heading.
  const standaloneCalendars =
    groups.length === 0 && !isAnonymous ? ungrouped : [];
  const standalonePick = useCalendarDigitPick({
    calendars: standaloneCalendars,
    onPick: (calendar) => {
      const displayName =
        calendar.provider === "local"
          ? calendar.name
          : calendarRowDisplayName(calendar);
      handleToggle(calendar, displayName);
    },
  });

  return (
    <section
      aria-label="Calendars"
      {...(groups.length === 0 ? pageJumpAttrs("calendars") : {})}
      {...(standaloneCalendars.length > 0 ? standalonePick.sectionProps : {})}
    >
      {/* Every connected account carries its own heading below, so the generic
          banner is only for users who have none yet and are signed in. Anonymous
          users get a single calendar row instead. Showing it alongside account
          sections would duplicate one section's status under a second, unlabeled
          heading with no way to tell them apart. */}
      {groups.length === 0 && !isAnonymous && <CalendarListHeader />}

      {hideCalendarsBody ? null : showCalendarsLoadError ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <p className="text-error">Couldn't load calendars.</p>
          <button
            className="c-focus-ring rounded-xs px-1.5 py-0.5 text-accent hover:brightness-110"
            onClick={() => void refetch()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : calendars.length === 0 && groups.length === 0 ? (
        showConnectCta ? null : (
          <p className="text-text-muted text-xs">No calendars yet.</p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const key = accountKey(group);
            const collapsed = collapsedKeys.has(key);
            const rows = collapsed ? [] : group.calendars;

            return (
              <CalendarDigitListSection
                aria-label={`Calendars for ${accountLabel(group)}`}
                calendars={rows}
                key={key}
                listId={collapsed ? undefined : accountCalendarListId(key)}
                onToggle={handleToggle}
                {...pageJumpAttrs(calendarAccountJumpId(key))}
              >
                <AccountSectionHeader
                  account={group}
                  connection={group.connection}
                  showProviderOnHover={sharedEmails.has(
                    normalizeEmail(group.accountEmail),
                  )}
                />
              </CalendarDigitListSection>
            );
          })}
          {ungrouped.length > 0 ? (
            groups.length > 0 && email ? (
              <CalendarDigitListSection
                aria-label={`Calendars for ${email}`}
                calendars={ungrouped}
                onToggle={handleToggle}
              >
                <div className="mb-1.5">
                  <h2 className="mb-0.5 font-semibold text-sm leading-none">
                    <span
                      className="min-w-0 truncate text-text-muted"
                      translate="no"
                    >
                      {email}
                    </span>
                  </h2>
                </div>
              </CalendarDigitListSection>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {ungrouped.map((calendar, index) =>
                  isAnonymous ? (
                    <AnonymousCalendarRow
                      calendar={calendar}
                      key={calendar.id}
                    />
                  ) : (
                    <CalendarRow
                      calendar={calendar}
                      key={calendar.id}
                      label={
                        calendar.provider === "local"
                          ? calendar.name
                          : undefined
                      }
                      onToggle={handleToggle}
                      pickKey={standalonePick.pickKeyFor(index)}
                    />
                  ),
                )}
              </ul>
            )
          ) : null}
        </div>
      )}

      <span aria-live="polite" className="sr-only" role="status">
        {announcement}
      </span>
    </section>
  );
};
