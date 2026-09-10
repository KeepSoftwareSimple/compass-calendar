import { expect, type Page } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

/**
 * Signed-in calendar harness for the attendee e2e specs (Google by default,
 * Microsoft via `prepareSignedInMicrosoftPage`).
 *
 * The Playwright web server runs the anonymous local-mode app (no backend on
 * port 3000), so these specs simulate the signed-in state the same way
 * e2e/oauth does: `__COMPASS_E2E_TEST__` engages the app's sanctioned e2e
 * seams (SessionProvider skips real SuperTokens checks; the user-metadata
 * store exposes its bridge), remembered auth (`compass.auth`) flips event
 * reads/writes onto the remote repository, and every `/api/**` request is
 * stubbed here — nothing real is contacted and every write body is captured
 * for payload assertions.
 */

export const ACCOUNT_EMAIL = "user@example.com";
export const MICROSOFT_ACCOUNT_EMAIL = "user@outlook.com";
/** ObjectId-shaped (CalendarIdSchema) id for the stubbed Google calendar. */
export const GOOGLE_CALENDAR_ID = "64b7f0a1c2d3e4f5a6b7c8d9";
/** ObjectId-shaped id for the stubbed Microsoft calendar. */
export const MICROSOFT_CALENDAR_ID = "64b7f0a1c2d3e4f5a6b7c8da";

const googleCalendar = {
  id: GOOGLE_CALENDAR_ID,
  name: "Work",
  description: "",
  timeZone: "Etc/UTC",
  foregroundColor: "#ffffff",
  backgroundColor: "#4285f4",
  provider: "google",
  access: "owner",
  capabilities: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: true,
    canWatchEvents: true,
    canInviteAttendees: true,
    conferenceKinds: ["meet"],
  },
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail: ACCOUNT_EMAIL,
};

const microsoftCalendar = {
  id: MICROSOFT_CALENDAR_ID,
  name: "Calendar",
  description: "",
  timeZone: "Etc/UTC",
  foregroundColor: "#ffffff",
  backgroundColor: "#0078D4",
  provider: "microsoft",
  access: "owner",
  capabilities: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: true,
    canWatchEvents: true,
    canInviteAttendees: true,
    conferenceKinds: ["teams"],
  },
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail: MICROSOFT_ACCOUNT_EMAIL,
};

/** A GoogleSyncConnectionSummary shape for the stubbed GET /api/user/metadata. */
const connectionSummary = (
  accountEmail: string,
  canSuggestContacts: boolean,
  provider: "google" | "microsoft" = "google",
  stateReason: string | null = null,
) => ({
  id:
    provider === "microsoft" ? "e2e-microsoft-connection" : "e2e-connection-1",
  provider,
  state: stateReason === "consentRequired" ? "actionRequired" : "healthy",
  stateReason,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail,
  connectionState:
    stateReason === "consentRequired"
      ? ("RECONNECT_REQUIRED" as const)
      : ("HEALTHY" as const),
  canSuggestContacts,
});

export interface AttendeeFixture {
  email: string;
  displayName: string | null;
  responseStatus: "needsAction" | "accepted" | "declined" | "tentative";
}

export interface EventFixture {
  id: string;
  calendarId: string;
  content: {
    kind: "details";
    title: string;
    description: string;
    location: string | null;
    organizer: { email: string; displayName: string | null } | null;
    attendees: AttendeeFixture[];
  };
  schedule: { kind: "timed"; start: string; end: string; timeZone: string };
  recurrence:
    | { kind: "single" }
    | { kind: "series"; rules: string[] }
    | { kind: "occurrence"; seriesId: string };
  createdAt: string;
  updatedAt: string | null;
}

/**
 * A one-hour timed event starting at the top of the current hour, so it is
 * always inside the week the grid opens on (and near the scroll position).
 */
export const buildEventFixture = (options: {
  id: string;
  title: string;
  calendarId?: string;
  attendees?: AttendeeFixture[];
  organizer?: { email: string; displayName: string | null } | null;
  recurrence?: EventFixture["recurrence"];
}): EventFixture => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const calendarId = options.calendarId ?? GOOGLE_CALENDAR_ID;
  const defaultOrganizerEmail =
    calendarId === MICROSOFT_CALENDAR_ID
      ? MICROSOFT_ACCOUNT_EMAIL
      : ACCOUNT_EMAIL;

  return {
    id: options.id,
    calendarId,
    content: {
      kind: "details",
      title: options.title,
      description: "",
      location: null,
      organizer:
        options.organizer === undefined
          ? { email: defaultOrganizerEmail, displayName: null }
          : options.organizer,
      attendees: options.attendees ?? [],
    },
    schedule: {
      kind: "timed",
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: "Etc/UTC",
    },
    recurrence: options.recurrence ?? { kind: "single" },
    createdAt: new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: null,
  };
};

export interface CapturedApiRequests {
  /** PUT /api/event/:id bodies, in order, with the decoded event id. */
  replaceRequests: Array<{ eventId: string; body: Record<string, unknown> }>;
  /** POST /api/event/:id/rsvp bodies, in order, with the decoded event id. */
  rsvpRequests: Array<{ eventId: string; body: Record<string, unknown> }>;
  /** `q` values of GET /api/contacts/suggestions calls, in order. */
  suggestionQueries: string[];
}

export interface SignedInPageOptions {
  events: EventFixture[];
  /** Payload for the stubbed GET /api/contacts/suggestions. */
  suggestions?: Array<{ email: string; displayName: string | null }>;
  /**
   * When true, the user-metadata store is seeded (via the e2e bridge) with a
   * healthy connection that granted the contacts scopes, so the attendee
   * field queries the stubbed suggestions endpoint.
   */
  canSuggestContacts?: boolean;
  provider?: "google" | "microsoft";
  /** Sync `stateReason` on the stubbed connection (e.g. consentRequired). */
  stateReason?: string | null;
}

export const prepareSignedInGooglePage = async (
  page: Page,
  options: SignedInPageOptions,
): Promise<CapturedApiRequests> => {
  const captured: CapturedApiRequests = {
    replaceRequests: [],
    rsvpRequests: [],
    suggestionQueries: [],
  };
  const suggestions = options.suggestions ?? [];
  const provider = options.provider ?? "google";
  const accountEmail =
    provider === "microsoft" ? MICROSOFT_ACCOUNT_EMAIL : ACCOUNT_EMAIL;
  const calendar =
    provider === "microsoft" ? microsoftCalendar : googleCalendar;
  const summary = connectionSummary(
    accountEmail,
    Boolean(options.canSuggestContacts),
    provider,
    options.stateReason ?? null,
  );
  const metadata = {
    connections: [summary],
    google: {
      connectionState: summary.connectionState,
      connections: [summary],
    },
  };

  await page.addInitScript((accountEmail) => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
    // Remembered auth: the app prefers the remote event repository once the
    // user has ever authenticated, which is what routes reads/writes through
    // the stubbed /api/** below.
    localStorage.setItem(
      "compass.auth",
      JSON.stringify({ hasAuthenticated: true, lastKnownEmail: accountEmail }),
    );
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
  }, accountEmail);

  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/api/calendars")) {
      return route.fulfill(json({ calendars: [calendar] }));
    }

    if (path.endsWith("/api/event") && request.method() === "GET") {
      return route.fulfill(json({ events: options.events }));
    }

    const replaceMatch = /\/api\/event\/([^/]+)$/.exec(path);
    if (replaceMatch && request.method() === "PUT") {
      const eventId = decodeURIComponent(replaceMatch[1]);
      const body = request.postDataJSON() as Record<string, unknown>;
      captured.replaceRequests.push({ eventId, body });
      // Settle the stubbed store the way the real pipeline would: retained
      // guests keep their provider responseStatus, new guests enter as
      // needsAction. The next list refetch (invalidation) then confirms the
      // optimistic paint instead of reverting it.
      const stored = options.events.find(
        (candidate) => candidate.id === eventId,
      );
      const content = body.content as
        | {
            title?: string;
            attendees?: Array<Omit<AttendeeFixture, "responseStatus">>;
          }
        | undefined;
      if (stored && content) {
        if (typeof content.title === "string") {
          stored.content.title = content.title;
        }
        if (Array.isArray(content.attendees)) {
          const previous = stored.content.attendees;
          stored.content.attendees = content.attendees.map(
            ({ email, displayName }) => ({
              email,
              displayName,
              responseStatus:
                previous.find(
                  (entry) => entry.email.toLowerCase() === email.toLowerCase(),
                )?.responseStatus ?? "needsAction",
            }),
          );
        }
      }
      return route.fulfill(json({ event: stored ?? options.events[0] }));
    }

    const rsvpMatch = /\/api\/event\/([^/]+)\/rsvp$/.exec(path);
    if (rsvpMatch && request.method() === "POST") {
      const eventId = decodeURIComponent(rsvpMatch[1]);
      const body = request.postDataJSON() as Record<string, unknown>;
      captured.rsvpRequests.push({ eventId, body });
      // Self-entry rewrite, like sync: only the account's own attendee entry
      // changes, so the invalidation refetch confirms the optimistic answer.
      const stored = options.events.find(
        (candidate) => candidate.id === eventId,
      );
      if (stored && typeof body.responseStatus === "string") {
        stored.content.attendees = stored.content.attendees.map((entry) =>
          entry.email.toLowerCase() === accountEmail.toLowerCase()
            ? {
                ...entry,
                responseStatus:
                  body.responseStatus as AttendeeFixture["responseStatus"],
              }
            : entry,
        );
      }
      return route.fulfill({ status: 204, body: "" });
    }

    if (path.endsWith("/api/contacts/suggestions")) {
      captured.suggestionQueries.push(url.searchParams.get("q") ?? "");
      return route.fulfill(json({ suggestions }));
    }

    if (path.endsWith("/api/user/metadata")) {
      // Must reflect canSuggestContacts on every fetch, not just the first:
      // refreshUserMetadata() re-fetches on its own (session events, google
      // sync refresh, periodic invalidation), and each response overwrites
      // the zustand store — a one-time bridge injection before this route
      // even existed would get clobbered back to false by the next fetch.
      return route.fulfill(json(metadata));
    }

    if (path.endsWith("/api/config")) {
      return route.fulfill(
        json({
          version: E2E_APP_CONFIG_VERSION,
          google: { isConfigured: true },
          providers: {
            google: { signIn: true, connect: true },
            microsoft: {
              signIn: false,
              connect: provider === "microsoft",
            },
            apple: { signIn: false, connect: false },
          },
        }),
      );
    }

    return route.fulfill(json({}));
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });
  // The header's one <h1> button doubles as the view switcher — the shared
  // signal that the calendar shell finished booting.
  await expect(
    page.getByRole("heading", { level: 1 }).getByRole("button"),
  ).toBeVisible({ timeout: 15000 });

  // `__COMPASS_E2E_TEST__` makes SessionProvider skip the real SuperTokens
  // check, so `useSession().authenticated` starts (and stays) false — it is
  // NOT derived from the remembered `compass.auth` flag above (that flag
  // only steers event.repository.source.store's local-vs-remote choice).
  // useCalendarsQuery gates its data source on `authenticated`
  // (calendarsQueryOptions), so without this the app queries GET /api/event
  // with the synthesized anonymous local-calendar id and none of this
  // harness's fixture events (attached to GOOGLE_CALENDAR_ID) ever appear on
  // the grid. Same fix as e2e/calendars/calendar-experience.spec.ts.
  await page.waitForFunction(
    () =>
      (
        window as Window & {
          __COMPASS_E2E_HOOKS__?: { setAuthenticated: (v: boolean) => void };
        }
      ).__COMPASS_E2E_HOOKS__ !== undefined,
  );
  await page.evaluate(() => {
    (
      window as Window & {
        __COMPASS_E2E_HOOKS__?: { setAuthenticated: (v: boolean) => void };
      }
    ).__COMPASS_E2E_HOOKS__?.setAuthenticated(true);
  });

  if (
    options.canSuggestContacts ||
    options.stateReason ||
    provider === "microsoft"
  ) {
    // The stubbed GET /api/user/metadata above already answers with the
    // capability set on every fetch (including refetches), so the initial
    // paint only needs a nudge: force one metadata refetch through the
    // e2e store bridge rather than waiting out staleTime.
    await page.waitForFunction(() => {
      const bridge = (
        window as Window & {
          __COMPASS_E2E_STORE__?: { userMetadata?: unknown };
        }
      ).__COMPASS_E2E_STORE__;
      return Boolean(bridge?.userMetadata);
    });
    await page.evaluate((nextMetadata) => {
      const bridge = (
        window as Window & {
          __COMPASS_E2E_STORE__?: {
            userMetadata?: { set: (metadata: unknown) => void };
          };
        }
      ).__COMPASS_E2E_STORE__;
      bridge?.userMetadata?.set(nextMetadata);
    }, metadata);
  }

  return captured;
};

export const prepareSignedInMicrosoftPage = (
  page: Page,
  options: SignedInPageOptions,
): Promise<CapturedApiRequests> =>
  prepareSignedInGooglePage(page, { ...options, provider: "microsoft" });

/**
 * Dispatches a real DOM click instead of Playwright's `.click()`. Buttons
 * inside OverlayPanel (the Send/Don't send invitation dialog,
 * RsvpScopeDialog's scope choices) sit in floating UI that re-renders
 * between Playwright's pointer-actionability check and the actual dispatch,
 * so a normal `.click()` silently lands on nothing and no handler runs — no
 * error, no request, no state change. Mirrors the Save-button workaround in
 * e2e/utils/event-test-utils.ts.
 */
export const dispatchClick = async (
  locator: import("@playwright/test").Locator,
) => {
  // Some targets (the sr-only radio inputs behind RsvpControl/
  // RsvpScopeDialog labels) are intentionally invisible, so wait for
  // DOM attachment rather than requiring toBeVisible.
  await locator.waitFor({ state: "attached", timeout: 10000 });
  await locator.evaluate((el) => {
    (el as HTMLElement).click();
  });
};

/** Opens the event's form by focusing its grid card and pressing Enter. */
export const openEventForm = async (page: Page, title: string) => {
  const eventButton = page.getByRole("button", { name: title }).last();
  await eventButton.waitFor({ state: "visible", timeout: 10000 });
  await eventButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form").getByPlaceholder("Title")).toHaveValue(
    title,
    { timeout: 10000 },
  );
};

/** The event form's guest combobox (AttendeeField). */
export const getGuestCombobox = (page: Page) =>
  page.getByRole("combobox", { name: "Guests" });

/**
 * Submits the open event form via its Save button. Mirrors
 * e2e/utils/event-test-utils.ts: the button sits in floating UI that can
 * re-render during pointer actionability checks, so dispatch a DOM click.
 */
export const clickSave = async (page: Page) => {
  const saveButton = page
    .getByRole("form")
    .getByRole("button", { name: "Save" });
  await expect(saveButton).toBeVisible({ timeout: 10000 });
  await saveButton.evaluate((el) => {
    (el as HTMLElement).click();
  });
};
