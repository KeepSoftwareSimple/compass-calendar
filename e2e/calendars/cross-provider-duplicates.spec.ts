import { expect, type Page, test } from "@playwright/test";
import {
  ensureSidebarOpen,
  getViewSwitcherButton,
} from "../utils/event-test-utils";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1600, height: 900 } });

const objectId = (seed: string) => seed.repeat(24);

const GOOGLE_CALENDAR_ID = objectId("a");
const MICROSOFT_CALENDAR_ID = objectId("b");
const APPLE_CALENDAR_ID = objectId("c");
const GOOGLE_EVENT_ID = objectId("1");
const MICROSOFT_EVENT_ID = objectId("2");
const APPLE_EVENT_ID = objectId("3");

const GOOGLE_EMAIL = "work@example.com";
const MICROSOFT_EMAIL = "user@outlook.com";
const APPLE_EMAIL = "user@icloud.com";

const EVENT_TITLE = "Cross-provider standup";
const SHARED_ICAL_UID =
  "040000008200E00074C5B7101A82E00800000000000000000000000000000000000000000000000000";

const TIME_ZONE = "America/Denver";

const ownerCapabilities = (conferenceKinds: readonly string[]) => ({
  canReadAvailability: true,
  canReadDetails: true,
  canWrite: true,
  canManage: true,
  canWatchEvents: true,
  canInviteAttendees: true,
  conferenceKinds,
});

const connection = (
  id: string,
  accountEmail: string,
  provider: "google" | "microsoft" | "apple",
) => ({
  id,
  provider,
  state: "healthy",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail,
  connectionState: "HEALTHY",
  canSuggestContacts: false,
});

const providerCalendar = (
  id: string,
  name: string,
  accountEmail: string,
  backgroundColor: string,
  provider: "google" | "microsoft" | "apple",
) => ({
  id,
  name,
  description: "",
  timeZone: TIME_ZONE,
  foregroundColor: "#ffffff",
  backgroundColor,
  provider,
  access: "owner",
  capabilities: ownerCapabilities(
    provider === "google"
      ? ["meet"]
      : provider === "microsoft"
        ? ["teams"]
        : [],
  ),
  isPrimary: true,
  isVisible: true,
  isActive: true,
  createsGoogleMeet: provider === "google",
  conference:
    provider === "google"
      ? "meet"
      : provider === "microsoft"
        ? "teams"
        : "none",
  accountEmail,
});

const pad = (value: number) => String(value).padStart(2, "0");

function toOffsetDateTime(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const minutes = pad(Math.abs(offsetMinutes) % 60);
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  return `${datePart}T${timePart}${sign}${hours}:${minutes}`;
}

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
  icalUid: string,
  startHour: number,
) {
  const startMinutes = startHour * 60;
  return {
    id,
    calendarId,
    content: { kind: "details", title: EVENT_TITLE, description: "" },
    schedule: {
      kind: "timed",
      start: toOffsetDateTime(todayAtMinutes(startMinutes)),
      end: toOffsetDateTime(todayAtMinutes(startMinutes + 60)),
      timeZone: TIME_ZONE,
    },
    recurrence: { kind: "single" },
    createdAt: toOffsetDateTime(new Date()),
    updatedAt: null,
    icalUid,
  };
}

type CompassE2EWindow = Window & {
  __COMPASS_E2E_TEST__?: boolean;
  __COMPASS_E2E_HOOKS__?: { setAuthenticated: (value: boolean) => void };
};

async function setupCrossProviderDuplicatesPage(page: Page) {
  const googleConnection = connection("conn-google", GOOGLE_EMAIL, "google");
  const microsoftConnection = connection(
    "conn-microsoft",
    MICROSOFT_EMAIL,
    "microsoft",
  );
  const appleConnection = connection("conn-apple", APPLE_EMAIL, "apple");

  const calendars = [
    providerCalendar(
      GOOGLE_CALENDAR_ID,
      "Work",
      GOOGLE_EMAIL,
      "#4285f4",
      "google",
    ),
    providerCalendar(
      MICROSOFT_CALENDAR_ID,
      "Outlook",
      MICROSOFT_EMAIL,
      "#0078D4",
      "microsoft",
    ),
    providerCalendar(
      APPLE_CALENDAR_ID,
      "iCloud",
      APPLE_EMAIL,
      "#8E8E93",
      "apple",
    ),
  ];

  const events = [
    buildEvent(GOOGLE_EVENT_ID, GOOGLE_CALENDAR_ID, SHARED_ICAL_UID, 10),
    buildEvent(MICROSOFT_EVENT_ID, MICROSOFT_CALENDAR_ID, SHARED_ICAL_UID, 10),
    buildEvent(APPLE_EVENT_ID, APPLE_CALENDAR_ID, SHARED_ICAL_UID, 10),
  ];

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
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (pathname.endsWith("/api/user/profile")) {
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
      return json({
        connections: [googleConnection, microsoftConnection, appleConnection],
        google: {
          connectionState: "HEALTHY",
          connections: [googleConnection],
        },
      });
    }
    if (pathname.endsWith("/api/config")) {
      return json({
        version: E2E_APP_CONFIG_VERSION,
        providers: {
          google: { signIn: true, connect: true },
          microsoft: { signIn: false, connect: true },
          apple: { signIn: false, connect: true },
        },
      });
    }
    if (pathname.endsWith("/api/calendars/availability")) {
      return json({ busyPeriods: [] });
    }
    if (pathname.endsWith("/api/calendars") && method === "GET") {
      return json({ calendars });
    }
    if (pathname.endsWith("/api/event") && method === "GET") {
      return json({ events });
    }

    return json({});
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });
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
  await ensureSidebarOpen(page);
}

test("merges the same invite on google, microsoft, and apple into one card with also-on and gradient", async ({
  page,
}) => {
  await setupCrossProviderDuplicatesPage(page);

  const grid = page.locator("#mainGrid");
  const cards = grid.getByRole("button", { name: new RegExp(EVENT_TITLE) });

  await expect(cards).toHaveCount(1);

  const card = cards.first();
  const accessibleName = await card.getAttribute("aria-label");
  expect(accessibleName).toMatch(/also on user@outlook\.com/);
  expect(accessibleName).toMatch(/Work calendar/);

  const gradient = await card.evaluate((node) => {
    const accent = node.querySelector(
      "[aria-hidden='true']",
    ) as HTMLElement | null;
    return accent?.style.backgroundImage ?? "";
  });
  expect(gradient).toContain("linear-gradient");
  expect(gradient).toMatch(/66,\s*133,\s*244/);
  expect(gradient).toMatch(/0,\s*120,\s*212/);
});
