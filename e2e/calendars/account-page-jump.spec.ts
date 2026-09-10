import { expect, type Page, test } from "@playwright/test";
import {
  ensureSidebarOpen,
  getViewSwitcherButton,
} from "../utils/event-test-utils";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1600, height: 900 } });

const WORK_EMAIL = "work@example.com";
const PERSONAL_EMAIL = "personal@example.com";
const WORK_CALENDAR_ID = "a".repeat(24);
const PERSONAL_CALENDAR_ID = "b".repeat(24);

type CompassE2EWindow = Window & {
  __COMPASS_E2E_TEST__?: boolean;
  __COMPASS_E2E_HOOKS__?: { setAuthenticated: (value: boolean) => void };
};

const ownerCapabilities = {
  canReadAvailability: true,
  canReadDetails: true,
  canWrite: true,
  canManage: true,
  canWatchEvents: true,
  canInviteAttendees: true,
  conferenceKinds: ["meet"],
};

const connection = (id: string, accountEmail: string) => ({
  id,
  state: "healthy",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail,
  connectionState: "HEALTHY",
  canSuggestContacts: false,
});

const googleCalendar = (
  id: string,
  name: string,
  accountEmail: string,
  backgroundColor: string,
) => ({
  id,
  name,
  description: "",
  timeZone: "Etc/UTC",
  foregroundColor: "#ffffff",
  backgroundColor,
  provider: "google",
  access: "owner",
  capabilities: ownerCapabilities,
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail,
});

const holdMod = async (page: Page) => {
  // This VM resolves Mod to Control. Hold only that key: a second modifier
  // (Meta) is treated as "not pausing to look" and cancels the hold timer.
  await page.keyboard.down("Control");
};

const releaseMod = async (page: Page) => {
  await page.keyboard.up("Control");
};

const setupTwoAccountWeek = async (page: Page) => {
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
        connections: [
          connection("conn-work", WORK_EMAIL),
          connection("conn-personal", PERSONAL_EMAIL),
        ],
        google: {
          connectionState: "HEALTHY",
        },
      });
    }
    if (pathname.endsWith("/api/config")) {
      return json({
        version: E2E_APP_CONFIG_VERSION,
        providers: {
          google: { signIn: true, connect: true },
          microsoft: { signIn: false, connect: false },
          apple: { signIn: false, connect: false },
        },
      });
    }
    if (pathname.endsWith("/api/calendars/availability")) {
      return json({ busyPeriods: [] });
    }
    if (pathname.endsWith("/api/calendars") && method === "GET") {
      return json({
        calendars: [
          googleCalendar(WORK_CALENDAR_ID, "Work", WORK_EMAIL, "#4285f4"),
          googleCalendar(
            PERSONAL_CALENDAR_ID,
            "Personal",
            PERSONAL_EMAIL,
            "#34a853",
          ),
        ],
      });
    }
    if (pathname.endsWith("/api/event") && method === "GET") {
      return json({ events: [] });
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
  await expect(
    page
      .locator("#sidebar")
      .getByRole("button", { name: /calendar$/ })
      .first(),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: WORK_EMAIL })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: PERSONAL_EMAIL }),
  ).toBeVisible();
};

test("hold-Mod gives each calendar account its own jump key, including collapsed ones", async ({
  page,
}) => {
  await setupTwoAccountWeek(page);

  const personalToggle = page.getByRole("button", { name: PERSONAL_EMAIL });
  await personalToggle.focus();
  await page.keyboard.press("Enter");
  await expect(personalToggle).toHaveAttribute("aria-expanded", "false");

  await holdMod(page);
  try {
    await expect(page.locator("[data-page-jump-hints]")).toBeVisible({
      timeout: 2000,
    });
    const jumpStatus = page
      .locator("[data-page-jump-hints]")
      .getByRole("status");
    await expect(jumpStatus).toContainText(`4 for ${WORK_EMAIL}`);
    await expect(jumpStatus).toContainText(`5 for ${PERSONAL_EMAIL}`);
    await page.screenshot({
      path: test.info().outputPath("hold-mod-account-chips.png"),
    });

    await page.keyboard.press("5");
  } finally {
    await releaseMod(page);
  }

  await expect(personalToggle).toBeFocused();
  await expect(personalToggle).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({
    path: test.info().outputPath("mod-5-expands-collapsed-account.png"),
  });
});
