import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  getPaletteSearch,
  openCommandPaletteWithKeyboard,
} from "../utils/event-test-utils";
import { prepareSignedInBookingSettingsPage } from "./booking-harness";

test.use({ viewport: { width: 1600, height: 900 } });

/**
 * Holds every matching GET until `release()` so a spec can measure the
 * loading layout, let the response land, and measure again. Registered after
 * the harness route, so Playwright tries it first.
 */
const holdGet = async (
  page: Page,
  pathSuffix: string,
  body: Record<string, unknown>,
) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  await page.route(
    (url) => url.pathname.endsWith(pathSuffix),
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      held += 1;
      await released;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  return { release, heldCount: () => held };
};

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return { x: Math.round(rect!.x), y: Math.round(rect!.y) };
};

const openMeetingTab = async (page: Page) => {
  await page.keyboard.press("ControlOrMeta+Comma");
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible({ timeout: 10_000 });
  await settingsDialog.getByRole("button", { name: /^Meeting/ }).click();
  return settingsDialog;
};

const IMPORTING_STATUS = {
  bookable: false,
  reasons: [
    { kind: "connection", reason: "importing", connectionState: "importing" },
  ],
};

for (const [label, status, expected] of [
  [
    "a blocker notice",
    IMPORTING_STATUS,
    settingsText("Guests can't book right now"),
  ],
  [
    "the live line",
    { bookable: true, reasons: [] },
    settingsText("On. Guests can book at your link."),
  ],
] as const) {
  test(`Meeting tab fields stay put when ${label} loads in`, async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, { openSettings: false });
    const statusGate = await holdGet(page, "/api/booking/page/status", status);

    const settingsDialog = await openMeetingTab(page);
    const meetingLink = settingsDialog.getByRole("textbox", {
      name: "Meeting link",
    });
    const duration = settingsDialog.getByLabel("Duration");
    const save = settingsDialog.getByRole("button", { name: "Save changes" });
    await expect(duration).toBeVisible({ timeout: 15_000 });
    await expect.poll(statusGate.heldCount).toBeGreaterThan(0);

    const before = {
      dialog: await box(settingsDialog),
      meetingLink: await box(meetingLink),
      duration: await box(duration),
      save: await box(save),
    };

    statusGate.release();
    await expect(expected(settingsDialog)).toBeVisible();

    expect({
      dialog: await box(settingsDialog),
      meetingLink: await box(meetingLink),
      duration: await box(duration),
      save: await box(save),
    }).toEqual(before);
  });
}

function settingsText(text: string) {
  return (settingsDialog: Locator) =>
    settingsDialog.getByText(text, { exact: false }).first();
}

test("Meeting nav row does not drop when switching Settings tabs", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, { openSettings: false });
  const settingsDialog = await openMeetingTab(page);
  const meetingNav = settingsDialog.getByRole("button", { name: /^Meeting/ });
  await expect(
    settingsDialog.getByRole("switch", { name: "Meeting page" }),
  ).toBeVisible({ timeout: 15_000 });
  const meetingBox = await box(meetingNav);
  const dialogBox = await settingsDialog.boundingBox();

  await settingsDialog.getByRole("button", { name: /^Accounts/ }).click();
  await expect(meetingNav).toBeVisible();

  expect(await box(meetingNav)).toEqual(meetingBox);
  const accountsDialogBox = await settingsDialog.boundingBox();
  expect(Math.round(accountsDialogBox!.y)).toBe(Math.round(dialogBox!.y));
});

test("command palette rows stay put when the meeting page command loads", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, { openSettings: false });
  const pageGate = await holdGet(page, "/api/booking/page", {
    enabled: true,
    durationMinutes: 45,
    destinationCalendarId: "64b7f0a1c2d3e4f5a6b7c8d9",
    blockingCalendarIds: ["64b7f0a1c2d3e4f5a6b7c8d9"],
    timeZone: "America/New_York",
    weeklyAvailability: [],
    minNoticeHours: 4,
    maxHorizonDays: 60,
    id: "000000000000000000000001",
    slug: "hostuser",
    hostUserId: "000000000000000000000002",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    bookingUrl: "https://compasscalendar.com/meet/hostuser",
  });

  await openCommandPaletteWithKeyboard(page);
  await expect(getPaletteSearch(page)).toBeVisible();
  const logOut = page.getByRole("option", { name: /^Log Out/ });
  await logOut.scrollIntoViewIfNeeded();
  await expect(logOut).toBeVisible();
  const loading = page.getByRole("option", { name: /^Meeting page/ });
  const loadingShown = (await pageGate.heldCount()) > 0;
  if (loadingShown) await expect(loading).toBeVisible();
  const before = await box(logOut);

  pageGate.release();
  await expect(
    page.getByRole("option", { name: /^Open meeting page/ }),
  ).toBeVisible();

  expect(await box(logOut)).toEqual(before);
});
