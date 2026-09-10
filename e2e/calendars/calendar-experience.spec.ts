import { expect, type Page, test } from "@playwright/test";
import {
  ensureSidebarOpen,
  getViewSwitcherButton,
  openTimedEventFormWithKeyboard,
} from "../utils/event-test-utils";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

// Wide enough for all 7 week columns (track needs GRID_MARGIN_LEFT +
// 7 * DAY_COLUMN_MIN_USABLE_WIDTH beside the sidebar). At the default
// 1280px, bare /week shows a 6-day Sun-Fri window anchored on the week
// start, which EXCLUDES today whenever today is Saturday (UTC) — the
// today-anchored fixtures below then never render and every assertion on
// them fails. Full width keeps "the default week view always includes
// today" true on every weekday.
test.use({ viewport: { width: 1600, height: 900 } });

// Fixtures. CalendarSchema/EventSchema (packages/core/src/types) are zod
// strictObjects - an extra or missing field fails parsing client-side and
// the app renders nothing, so every fixture below is a full, honest member
// of those shapes. IDs are 24-char hex (ObjectId format). Event times anchor
// on "today" so the default week view (dayjs().startOf("week"), always
// including today at full width - see the viewport note above) renders them
// without knowing the week-start convention.

const objectId = (seed: string) => seed.repeat(24);

const CALENDAR_A_ID = objectId("a");
const CALENDAR_B_ID = objectId("b");
const CALENDAR_LOCAL_ID = objectId("c");
const CALENDAR_MS_ID = objectId("d");
const EVENT_A_ID = objectId("1");
const EVENT_B_ID = objectId("2");

const CALENDAR_A_NAME = "Acme Work";
const CALENDAR_B_NAME = "Design Team";
const LOCAL_CALENDAR_NAME = "Local";
const CALENDAR_MS_NAME = "Focus";
const MICROSOFT_ACCOUNT_EMAIL = "user@outlook.com";

const EVENT_A_TITLE = "Team sync";
const EVENT_B_TITLE = "Reader event";

const TIME_ZONE = "America/Denver";

const CAPABILITIES = {
  owner: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: true,
    canWatchEvents: true,
    canInviteAttendees: true,
    conferenceKinds: ["meet"],
  },
  reader: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: false,
    canManage: false,
    canWatchEvents: true,
    canInviteAttendees: false,
    conferenceKinds: [],
  },
};

function calendar(overrides: {
  id: string;
  name: string;
  timeZone: string | null;
  backgroundColor: string;
  provider: "local" | "google" | "microsoft";
  access: "owner" | "reader";
  isPrimary: boolean;
  isVisible: boolean;
  accountEmail?: string;
}) {
  const base = CAPABILITIES[overrides.access];
  return {
    ...overrides,
    description: "",
    foregroundColor: "#ffffff",
    capabilities: {
      ...base,
      conferenceKinds:
        overrides.access !== "owner"
          ? []
          : overrides.provider === "google"
            ? ["meet"]
            : overrides.provider === "microsoft"
              ? ["teams"]
              : [],
    },
    isActive: true,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

// Formats a local Date as RFC3339 with an explicit numeric offset (never
// "Z"), matching the DateTimeSchema contract and staying correct regardless
// of which timezone the test happens to run in.
function toOffsetDateTime(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const minutes = pad(Math.abs(offsetMinutes) % 60);
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  return `${datePart}T${timePart}${sign}${hours}:${minutes}`;
}

// A Date at today + the given minute offset from midnight local time -
// always inside the currently-viewed week, regardless of the app's
// week-start convention.
function todayAtMinutes(minutesFromMidnight: number): Date {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    minutesFromMidnight,
  );
}

function buildEvent(
  id: string,
  calendarId: string,
  title: string,
  startHour: number,
  // A tall-enough card keeps click/drag targets clear of the (invisible,
  // still hit-testable) resize handles pinned to its top/bottom edges.
  durationMinutes = 90,
) {
  const startMinutes = startHour * 60;
  return {
    id,
    calendarId,
    content: { kind: "details", title, description: "" },
    schedule: {
      kind: "timed",
      start: toOffsetDateTime(todayAtMinutes(startMinutes)),
      end: toOffsetDateTime(todayAtMinutes(startMinutes + durationMinutes)),
      timeZone: TIME_ZONE,
    },
    recurrence: { kind: "single" },
    createdAt: toOffsetDateTime(new Date()),
    updatedAt: null,
  };
}

type FixtureEvent = ReturnType<typeof buildEvent>;

const DEFAULT_EVENTS: FixtureEvent[] = [
  buildEvent(EVENT_A_ID, CALENDAR_A_ID, EVENT_A_TITLE, 9),
  buildEvent(EVENT_B_ID, CALENDAR_B_ID, EVENT_B_TITLE, 13),
];

type FixtureCalendar = ReturnType<typeof calendar>;

function microsoftCalendar(): FixtureCalendar {
  return calendar({
    id: CALENDAR_MS_ID,
    name: CALENDAR_MS_NAME,
    timeZone: TIME_ZONE,
    backgroundColor: "#0078D4",
    provider: "microsoft",
    access: "owner",
    isPrimary: true,
    isVisible: true,
    accountEmail: MICROSOFT_ACCOUNT_EMAIL,
  });
}

function microsoftConnectionSummary() {
  return {
    id: "e2e-microsoft-connection",
    provider: "microsoft" as const,
    state: "healthy",
    stateReason: null,
    lastSyncedAt: null,
    lastHealthyAt: null,
    accountEmail: MICROSOFT_ACCOUNT_EMAIL,
    connectionState: "HEALTHY" as const,
    canSuggestContacts: false,
  };
}

function buildCalendars(extra: FixtureCalendar[] = []) {
  // Server isVisible is ignored by the web (S39 A2 overlays localStorage).
  return [
    calendar({
      id: CALENDAR_A_ID,
      name: CALENDAR_A_NAME,
      timeZone: TIME_ZONE,
      backgroundColor: "#4285f4",
      provider: "google",
      access: "owner",
      isPrimary: true,
      isVisible: true,
    }),
    calendar({
      id: CALENDAR_B_ID,
      name: CALENDAR_B_NAME,
      timeZone: TIME_ZONE,
      backgroundColor: "#34a853",
      provider: "google",
      access: "reader",
      isPrimary: false,
      isVisible: true,
    }),
    calendar({
      id: CALENDAR_LOCAL_ID,
      name: LOCAL_CALENDAR_NAME,
      timeZone: null,
      backgroundColor: "#9aa0a6",
      provider: "local",
      access: "owner",
      isPrimary: false,
      isVisible: true,
    }),
    ...extra,
  ];
}

interface CalendarExperienceHarness {
  mutationRequests: { method: string; pathname: string }[];
}

type CompassE2EWindow = Window & {
  __COMPASS_E2E_TEST__?: boolean;
  __COMPASS_E2E_HOOKS__?: { setAuthenticated: (value: boolean) => void };
};

async function waitForCalendarExperienceReady(page: Page) {
  await getViewSwitcherButton(page).waitFor({
    state: "visible",
    timeout: 15000,
  });

  await page.waitForFunction(
    () => (window as CompassE2EWindow).__COMPASS_E2E_HOOKS__ !== undefined,
  );
  await page.evaluate(() => {
    (window as CompassE2EWindow).__COMPASS_E2E_HOOKS__?.setAuthenticated(true);
  });

  // useSSEConnection.ts invalidates the calendars query when `authenticated`
  // flips; wait for that refetch to land before handing control to the test.
  await expect(
    page
      .locator("#sidebar")
      .getByRole("button", { name: /calendar$/ })
      .first(),
  ).toBeVisible({
    timeout: 10000,
  });
}

function gridEventCard(page: Page, title: string, hidden: boolean) {
  const prefix = hidden ? "^Hidden Timed event: " : "^Timed event: ";
  return page.locator("#mainGrid").getByRole("button", {
    name: new RegExp(`${prefix}${title}`),
  });
}

async function expectEventCardWidth(
  page: Page,
  title: string,
  hidden: boolean,
) {
  const card = gridEventCard(page, title, hidden);
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (hidden) {
    expect(box!.width).toBeLessThan(12);
  } else {
    expect(box!.width).toBeGreaterThan(12);
  }
  return card;
}

async function hideFocusedEventViaMenu(page: Page) {
  await page.keyboard.press("m");
  const hideItem = page
    .getByRole("menu")
    .getByRole("menuitem", { name: "Hide event", exact: true });
  await expect(hideItem).toBeVisible();
  await hideItem.click();
}

// Playwright's page.keyboard.press is unreliable for bare letters in headless
// Chromium on Linux. Dispatch a real keydown on the focused card instead.
async function pressBareLetterOnFocusedCard(page: Page, letter: string) {
  await page.evaluate((key) => {
    const target = document.activeElement ?? document;
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  }, letter);
}

/**
 * Sets up the packet-08 authenticated experience over route-stubbed APIs: an
 * e2e-mode window flag (skips the real SuperTokens check), a pre-seeded
 * "has authenticated before" flag (so the event repository targets the
 * remote API instead of IndexedDB - see event.repository.factory.ts), and
 * handlers for every endpoint the calendar sidebar/CalendarSelect/read-only
 * form/availability query touch. Visibility is client-owned (S39 A2): the
 * event list returns every fixture event; the web filters via localStorage.
 * Hidden-event ids persist in this harness across reload so GET/PUT
 * `/api/user/hidden-events` round-trips like the real backend.
 */
async function setupCalendarExperiencePage(
  page: Page,
  events: FixtureEvent[] = DEFAULT_EVENTS,
  options: {
    extraCalendars?: FixtureCalendar[];
    metadata?: Record<string, unknown>;
    microsoftConnect?: boolean;
  } = {},
): Promise<CalendarExperienceHarness> {
  const harness: CalendarExperienceHarness = {
    mutationRequests: [],
  };
  const extraCalendars = options.extraCalendars ?? [];
  const hasMicrosoft = extraCalendars.some(
    (entry) => entry.provider === "microsoft",
  );
  const metadata = options.metadata ?? {
    connections: [],
    google: { connectionState: "HEALTHY" },
  };
  const microsoftConnect = Boolean(options.microsoftConnect || hasMicrosoft);
  const hiddenEventIds = new Set<string>();

  await page.addInitScript(() => {
    (window as CompassE2EWindow).__COMPASS_E2E_TEST__ = true;
    window.alert = () => undefined;
    window.confirm = () => true;
    window.prompt = () => null;
    localStorage.setItem(
      "compass.auth",
      JSON.stringify({
        hasAuthenticated: true,
        lastKnownEmail: "e2e@example.com",
        shouldPromptSignUpAfterAnonymousCalendarChange: false,
      }),
    );
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (pathname.endsWith("/api/user/profile")) {
      // The calendar list header shows the profile email; the catch-all `{}`
      // below would leave it null and render the anonymous header instead.
      return json({
        userId: "e2e-user",
        email: "e2e@example.com",
        firstName: "E2E",
        lastName: "User",
        name: "E2E User",
        locale: "en",
        picture: "",
      });
    }
    if (pathname.endsWith("/api/user/metadata")) {
      return json(metadata);
    }
    if (pathname.endsWith("/api/user/hidden-events") && method === "GET") {
      return json({ hiddenEventIds: [...hiddenEventIds] });
    }
    if (pathname.endsWith("/api/user/hidden-events") && method === "PUT") {
      const body = request.postDataJSON() as {
        eventId?: unknown;
        hidden?: unknown;
      };
      if (typeof body.eventId === "string") {
        if (body.hidden === true) {
          hiddenEventIds.add(body.eventId);
        } else if (body.hidden === false) {
          hiddenEventIds.delete(body.eventId);
        }
      }
      return json({ hiddenEventIds: [...hiddenEventIds] });
    }
    if (pathname.endsWith("/api/config")) {
      return json({
        version: E2E_APP_CONFIG_VERSION,
        providers: {
          google: { signIn: true, connect: true },
          microsoft: { signIn: false, connect: microsoftConnect },
          apple: { signIn: false, connect: false },
        },
      });
    }
    if (pathname.endsWith("/api/calendars/availability")) {
      return json({ busyPeriods: [] });
    }
    if (pathname.endsWith("/api/calendars") && method === "GET") {
      return json({ calendars: buildCalendars(extraCalendars) });
    }
    if (pathname.endsWith("/api/event") && method === "GET") {
      return json({ events });
    }
    if (pathname.startsWith("/api/event") && method !== "GET") {
      harness.mutationRequests.push({ method, pathname });
      return json({});
    }

    return json({});
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await waitForCalendarExperienceReady(page);

  return harness;
}

test("sidebar lists calendars, toggles visibility in localStorage, and shows card identity", async ({
  page,
}) => {
  await setupCalendarExperiencePage(page);
  await ensureSidebarOpen(page);
  const sidebar = page.locator("#sidebar");
  const grid = page.locator("#mainGrid");

  // The list header is the account email; the primary calendar's own name
  // (which duplicates it) is replaced by a "primary" row.
  await expect(
    sidebar.getByRole("heading", { name: "e2e@example.com" }),
  ).toBeVisible();
  await expect(sidebar.getByText("primary", { exact: true })).toBeVisible();
  await expect(sidebar.getByText(CALENDAR_A_NAME, { exact: true })).toHaveCount(
    0,
  );
  await expect(
    sidebar.getByText(CALENDAR_B_NAME, { exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByText(LOCAL_CALENDAR_NAME, { exact: true }),
  ).toBeVisible();

  // Identity: both cards' accessible names include their calendar's name.
  await expect(
    grid.getByRole("button", {
      name: new RegExp(`${EVENT_A_TITLE}.*${CALENDAR_A_NAME} calendar`),
    }),
  ).toBeVisible();
  await expect(
    grid.getByRole("button", {
      name: new RegExp(`${EVENT_B_TITLE}.*${CALENDAR_B_NAME} calendar`),
    }),
  ).toBeVisible();

  const toggleB = sidebar.getByRole("button", {
    name: new RegExp(`^(Show|Hide) ${CALENDAR_B_NAME} calendar$`),
  });

  await toggleB.focus();
  await page.keyboard.press("Enter");
  await expect(toggleB).toHaveAttribute("aria-pressed", "false");
  await expect(grid.getByRole("button", { name: EVENT_B_TITLE })).toHaveCount(
    0,
  );
  await expect(grid.getByRole("button", { name: EVENT_A_TITLE })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("compass.calendars.hidden-ids");
        return raw ? (JSON.parse(raw) as string[]) : [];
      }),
    )
    .toEqual([CALENDAR_B_ID]);

  await toggleB.focus();
  await page.keyboard.press("Enter");
  await expect(toggleB).toHaveAttribute("aria-pressed", "true");
  await expect(grid.getByRole("button", { name: EVENT_B_TITLE })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("compass.calendars.hidden-ids")),
    )
    .toBeNull();
});

test("day view separates visible calendars into distinct columns", async ({
  page,
}) => {
  await setupCalendarExperiencePage(page);

  await page.keyboard.press("d");
  await page.waitForURL((url) => url.pathname.startsWith("/day"), {
    timeout: 10000,
  });

  const dayAgenda = page.getByRole("region", { name: "Calendar agenda" });
  const calendarHeaders = dayAgenda.getByRole("region", {
    name: "Calendars",
  });
  // Column cells (exact aria-label), not the inner "Focus … column" button.
  const primaryHeader = calendarHeaders.getByLabel(CALENDAR_A_NAME, {
    exact: true,
  });
  const readerHeader = calendarHeaders.getByLabel(CALENDAR_B_NAME, {
    exact: true,
  });
  const primaryEvent = dayAgenda.getByRole("button", {
    name: new RegExp(`${EVENT_A_TITLE}.*${CALENDAR_A_NAME} calendar`),
  });
  const readerEvent = dayAgenda.getByRole("button", {
    name: new RegExp(`${EVENT_B_TITLE}.*${CALENDAR_B_NAME} calendar`),
  });

  await expect(primaryHeader).toBeVisible();
  await expect(readerHeader).toBeVisible();
  const themeTextColor = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text)";
    document.documentElement.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(primaryHeader).toHaveCSS("color", themeTextColor);
  await expect(readerHeader).toHaveCSS("color", themeTextColor);
  await expect(primaryEvent).toBeVisible();
  await expect(readerEvent).toBeVisible();

  const [primaryHeaderBox, readerHeaderBox, primaryEventBox, readerEventBox] =
    await Promise.all([
      primaryHeader.boundingBox(),
      readerHeader.boundingBox(),
      primaryEvent.boundingBox(),
      readerEvent.boundingBox(),
    ]);

  expect(primaryHeaderBox).not.toBeNull();
  expect(readerHeaderBox).not.toBeNull();
  expect(primaryEventBox).not.toBeNull();
  expect(readerEventBox).not.toBeNull();
  expect(readerHeaderBox!.x).toBeGreaterThan(primaryHeaderBox!.x);
  expect(readerEventBox!.x).toBeGreaterThan(primaryEventBox!.x);
  expect(primaryEventBox!.width).toBeLessThanOrEqual(primaryHeaderBox!.width);
  expect(readerEventBox!.width).toBeLessThanOrEqual(readerHeaderBox!.width);
});

test("a new event form offers only writable calendars", async ({ page }) => {
  await setupCalendarExperiencePage(page, []);

  await openTimedEventFormWithKeyboard(page);
  const form = page.getByRole("form");
  // CalendarSelect's trigger is a <button aria-haspopup="listbox"
  // aria-expanded>; Chromium computes that combination as role "combobox".
  const trigger = form.getByRole("combobox", {
    name: `Calendar: ${CALENDAR_A_NAME} (primary)`,
  });
  await expect(trigger).toBeVisible();

  await trigger.focus();
  await page.keyboard.press("Enter");
  // Scoped by name: the sidebar's always-visible month picker is also a
  // role="listbox" (of day options), and the two would otherwise collide.
  const listbox = page.getByRole("listbox", { name: "Calendar" });
  await expect(listbox.getByRole("option")).toHaveCount(2);
  await expect(
    listbox.getByRole("option", { name: LOCAL_CALENDAR_NAME, exact: true }),
  ).toBeVisible();
  await expect(
    listbox.getByRole("option", { name: CALENDAR_B_NAME }),
  ).toHaveCount(0);

  // Deliberately NOT exercised here: committing a selection with
  // ArrowDown+Enter. That flow was intermittently flaky under Playwright's
  // faster-than-human key cadence (~40% across repeated isolated runs, even
  // after hardening the component against a real trigger-Enter race and
  // waiting for the roving tabindex to move) and was deleted rather than
  // left flaky. Keyboard navigation + Enter/Space selection are covered
  // deterministically in CalendarSelect.test.tsx.
});

test("a read-only event blocks a drag attempt", async ({ page }) => {
  const harness = await setupCalendarExperiencePage(page);
  const card = page
    .locator("#mainGrid")
    .getByRole("button", { name: EVENT_B_TITLE })
    .last();

  await card.scrollIntoViewIfNeeded();

  // isEventReadOnly (useCalendarLookup.ts) fails OPEN as writable until the
  // authenticated calendars query resolves, so the card can briefly register
  // for drag/resize right after setupCalendarExperiencePage returns (its
  // own wait only confirms the sidebar reflects the refetch, not this
  // card's next render). Id attrs now stamp even for read-only cards; wait
  // for the calendar-name accessible suffix instead - that only appears
  // once the multi-calendar lookup that drives isReadOnly has settled.
  await expect(card).toHaveAttribute(
    "data-week-interaction-event-id",
    EVENT_B_ID,
  );
  await expect(card).toHaveAccessibleName(
    new RegExp(`${EVENT_B_TITLE}.*${CALENDAR_B_NAME} calendar`),
  );

  // A read-only event is not a mutable nudge target, so Shift+Arrow on the
  // focused card never becomes a real move - no mutation fires and the card
  // stays exactly where it was.
  await card.focus();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(150);

  expect(harness.mutationRequests).toHaveLength(0);
  await expect(card).toBeVisible();
});

test("a read-only event opens as a read-only form", async ({ page }) => {
  const harness = await setupCalendarExperiencePage(page);
  const card = page
    .locator("#mainGrid")
    .getByRole("button", { name: EVENT_B_TITLE })
    .last();

  // Opens via the context menu's View action, driven by the keyboard: m
  // opens the menu on the focused card, and Enter runs the seeded item.
  await card.focus();
  await page.keyboard.press("m");
  const viewItem = page
    .getByRole("menu")
    .getByRole("menuitem", { name: "View" });
  await viewItem.focus();
  await page.keyboard.press("Enter");

  const form = page.getByRole("form");
  const titleInput = form.getByPlaceholder("Title");
  await expect(titleInput).toHaveValue(EVENT_B_TITLE);
  await expect(titleInput).toBeDisabled();
  await expect(form.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(form.getByRole("note")).toContainText("Read-only");
  await expect(form.getByText(`Calendar: ${CALENDAR_B_NAME}`)).toBeVisible();

  expect(harness.mutationRequests).toHaveLength(0);
});

test("a read-only event's context menu offers view, duplicate, and hide but not delete", async ({
  page,
}) => {
  await setupCalendarExperiencePage(page);
  const card = page
    .locator("#mainGrid")
    .getByRole("button", { name: EVENT_B_TITLE })
    .last();

  await card.focus();
  await page.keyboard.press("m");

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "View" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Hide event", exact: true }),
  ).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
});

test("a read-only event can be hidden from the menu, shown with x, and stays hidden after reload", async ({
  page,
}) => {
  await setupCalendarExperiencePage(page);
  const card = page
    .locator("#mainGrid")
    .getByRole("button", { name: EVENT_B_TITLE })
    .last();

  await card.focus();
  await hideFocusedEventViaMenu(page);
  const hiddenCard = await expectEventCardWidth(page, EVENT_B_TITLE, true);

  await hiddenCard.focus();
  await pressBareLetterOnFocusedCard(page, "x");
  await expectEventCardWidth(page, EVENT_B_TITLE, false);

  const shownCard = gridEventCard(page, EVENT_B_TITLE, false);
  await shownCard.focus();
  await hideFocusedEventViaMenu(page);
  await expectEventCardWidth(page, EVENT_B_TITLE, true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForCalendarExperienceReady(page);
  await expectEventCardWidth(page, EVENT_B_TITLE, true);
});

test("a writable event can be hidden from the menu and shown with x", async ({
  page,
}) => {
  await setupCalendarExperiencePage(page);
  const card = page
    .locator("#mainGrid")
    .getByRole("button", { name: EVENT_A_TITLE })
    .last();

  await card.focus();
  await hideFocusedEventViaMenu(page);
  const hiddenCard = await expectEventCardWidth(page, EVENT_A_TITLE, true);

  await hiddenCard.focus();
  await pressBareLetterOnFocusedCard(page, "x");
  await expectEventCardWidth(page, EVENT_A_TITLE, false);
});

test("sidebar lists a Microsoft calendar under its account heading", async ({
  page,
}) => {
  const summary = microsoftConnectionSummary();
  await setupCalendarExperiencePage(page, DEFAULT_EVENTS, {
    extraCalendars: [microsoftCalendar()],
    metadata: {
      connections: [summary],
      google: { connectionState: "HEALTHY", connections: [summary] },
    },
  });
  await ensureSidebarOpen(page);

  const microsoftSection = page.getByRole("region", {
    name: `Calendars for ${MICROSOFT_ACCOUNT_EMAIL}`,
  });
  await expect(
    microsoftSection.getByRole("heading", { name: MICROSOFT_ACCOUNT_EMAIL }),
  ).toBeVisible();
  await expect(
    microsoftSection.getByText("primary", { exact: true }),
  ).toBeVisible();
  await expect(
    microsoftSection.getByText(CALENDAR_MS_NAME, { exact: true }),
  ).toHaveCount(0);
  await expect(
    microsoftSection.getByRole("button", {
      name: /^(Show|Hide) primary calendar$/,
    }),
  ).toBeVisible();
});
