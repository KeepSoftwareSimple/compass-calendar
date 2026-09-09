import { expect, type Locator, test } from "@playwright/test";
import { DEFAULT_WEEKLY_AVAILABILITY } from "@core/types/booking.contracts";
import { expectNoAxeViolations } from "../utils/axe-assertion";
import {
  BOOKING_CALENDAR_ID,
  COMPASS_CALENDAR_ID,
  dispatchClick,
  dispatchFill,
  expectMeetingShortcutChips,
  holdSettingsMod,
  prepareSignedInBookingSettingsPage,
  releaseSettingsMod,
} from "./booking-harness";

test.use({ viewport: { width: 1600, height: 900 } });

const openMoreOptions = async (settingsDialog: Locator) => {
  await settingsDialog.getByText("More options", { exact: true }).click();
};

const scrollSettingsDialog = async (
  settingsDialog: Locator,
  scrollTop: number,
) =>
  settingsDialog.evaluate((el, top) => {
    const scroller =
      (el.querySelector(":scope > .overflow-y-auto") as HTMLElement | null) ??
      el;
    scroller.scrollTop = top;
    return scroller.scrollTop;
  }, scrollTop);

test("settings booking page shows a copyable public link after save", async ({
  page,
}) => {
  const bookingUrl = "https://compasscalendar.com/meet/hostuser";
  const captured = await prepareSignedInBookingSettingsPage(page, {
    bookingUrl,
  });

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByLabel("Duration").selectOption("30");
  await dispatchClick(
    settingsDialog.getByRole("button", { name: "Save changes" }),
  );

  await expect.poll(() => captured.putBodies.length).toBe(1);
  await expect(
    settingsDialog.getByRole("textbox", { name: "Meeting link" }),
  ).toHaveValue(bookingUrl);
  await expect(
    settingsDialog.getByRole("link", { name: "Open meeting page" }),
  ).toHaveAttribute("href", bookingUrl);
  expect(captured.putBodies[0]).toMatchObject({ durationMinutes: 30 });

  await settingsDialog.getByLabel("Duration").selectOption("15");
  await dispatchClick(
    settingsDialog.getByRole("button", { name: "Save changes" }),
  );

  await expect.poll(() => captured.putBodies.length).toBe(2);
  expect(captured.putBodies[1]).toMatchObject({ durationMinutes: 15 });
});

test("clearing the horizon field shows an inline error and blocks save", async ({
  page,
}) => {
  const captured = await prepareSignedInBookingSettingsPage(page);

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await openMoreOptions(settingsDialog);
  const horizon = settingsDialog.getByLabel("Maximum horizon (days)");
  await dispatchFill(horizon, "");

  await expect(settingsDialog.getByText("Enter 1 to 60 days.")).toBeVisible();
  await expect(horizon).toHaveAttribute("aria-invalid", "true");

  await dispatchClick(
    settingsDialog.getByRole("button", { name: "Save changes" }),
  );
  await expect(
    settingsDialog.getByText(
      "Fix the highlighted number fields before saving.",
    ),
  ).toBeVisible();
  expect(captured.putBodies.length).toBe(0);

  await dispatchFill(horizon, "30");
  await expect(settingsDialog.getByText("Enter 1 to 60 days.")).toHaveCount(0);
  await dispatchClick(
    settingsDialog.getByRole("button", { name: "Save changes" }),
  );

  await expect.poll(() => captured.putBodies.length).toBe(1);
  expect(captured.putBodies[0]).toMatchObject({ maxHorizonDays: 30 });
});

test("keyboard hint sits in the nav column and the last control stays above Save", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, {
    bookingUrl: "https://compasscalendar.com/meet/hostuser",
  });

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  const topBefore = (await settingsDialog.boundingBox())?.y;
  await openMoreOptions(settingsDialog);
  const topAfter = (await settingsDialog.boundingBox())?.y;
  expect(topAfter).toBe(topBefore);
  const hint = settingsDialog.locator("nav p", {
    hasText: "to see shortcuts.",
  });
  const lastControl = settingsDialog.getByLabel("Maximum horizon (days)");
  const save = settingsDialog.getByRole("button", {
    name: "Save changes",
  });

  await expect(hint).toBeVisible();

  await lastControl.scrollIntoViewIfNeeded();
  await scrollSettingsDialog(settingsDialog, 10_000);

  const lastBox = await lastControl.boundingBox();
  const saveBarTop = await save.evaluate((el) => {
    const bar = el.closest(".sticky");
    return bar?.getBoundingClientRect().y ?? null;
  });
  expect(lastBox).not.toBeNull();
  expect(saveBarTop).not.toBeNull();
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(saveBarTop!);
});

test("saves with Compass checked as a blocking calendar", async ({ page }) => {
  const captured = await prepareSignedInBookingSettingsPage(page);

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await openMoreOptions(settingsDialog);
  const compass = settingsDialog.getByRole("checkbox", { name: "Compass" });
  await expect(compass).toBeVisible();
  await expect(
    settingsDialog.getByRole("checkbox", { name: "Work" }),
  ).toBeVisible();
  await expect.poll(async () => compass.isChecked()).toBe(false);
  await compass.evaluate((el) => {
    (el as HTMLInputElement).click();
  });
  await expect(compass).toBeChecked();

  await dispatchClick(
    settingsDialog.getByRole("button", { name: "Save changes" }),
  );

  await expect.poll(() => captured.putBodies.length).toBe(1);
  expect(captured.putBodies[0]?.blockingCalendarIds).toEqual(
    expect.arrayContaining([BOOKING_CALENDAR_ID, COMPASS_CALENDAR_ID]),
  );
});

test("turns on a not-live page in one click", async ({ page }) => {
  const captured = await prepareSignedInBookingSettingsPage(page, {
    enabled: false,
  });

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await dispatchClick(
    settingsDialog.getByRole("switch", { name: "Meeting page" }),
  );

  await expect.poll(() => captured.putBodies.length).toBe(1);
  expect(captured.putBodies[0]).toMatchObject({ enabled: true });
});

test("first visit: keyboard setup wizard through go live", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const captured = await prepareSignedInBookingSettingsPage(page, {
    configured: false,
    enabled: false,
  });

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(
    settingsDialog
      .locator("p.text-text-muted")
      .filter({ hasText: /^Step 1 of \d+$/ }),
  ).toBeVisible();
  await expect(
    settingsDialog.getByRole("heading", { name: "Pick your address" }),
  ).toBeVisible();
  await expect(settingsDialog.getByLabel("Page address")).toHaveValue(
    "hostuser",
  );

  await dispatchFill(settingsDialog.getByLabel("Page address"), "hostuser");
  await settingsDialog.getByLabel("Page address").press("Enter");

  await expect.poll(() => captured.putBodies.length).toBe(1);
  expect(captured.putBodies[0]).toMatchObject({
    enabled: false,
    slug: "hostuser",
    weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
  });

  await expect(
    settingsDialog
      .locator("p.text-text-muted")
      .filter({ hasText: /^Step 2 of \d+$/ }),
  ).toBeVisible();
  await page.keyboard.press("k");
  await expect(
    settingsDialog
      .locator("p.text-text-muted")
      .filter({ hasText: /^Step 3 of \d+$/ }),
  ).toBeVisible();
  await page.keyboard.press("k");
  await expect(
    settingsDialog
      .locator("p.text-text-muted")
      .filter({ hasText: /^Step 4 of \d+$/ }),
  ).toBeVisible();

  await dispatchClick(
    settingsDialog.getByRole("button", { name: /Turn on and copy link/ }),
  );

  await expect.poll(() => captured.putBodies.length).toBe(2);
  expect(captured.putBodies[1]).toMatchObject({
    enabled: true,
    weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
  });

  await expect(
    settingsDialog.getByRole("textbox", { name: "Meeting link" }),
  ).toBeVisible();
  await expect(
    settingsDialog.getByRole("switch", { name: "Meeting page" }),
  ).toBeFocused();
  await expect(
    page.getByText("Your meeting page is live. Link copied."),
  ).toBeVisible();
  await expect(
    settingsDialog.getByRole("textbox", { name: "Meeting link" }),
  ).toHaveValue("https://compasscalendar.com/meet/hostuser");
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("https://compasscalendar.com/meet/hostuser");

  await holdSettingsMod(page);
  try {
    await expectMeetingShortcutChips(settingsDialog);
  } finally {
    await releaseSettingsMod(page);
  }

  await page.goto("/book/hostuser?token=abc", {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(/\/meet\/hostuser/);
  expect(new URL(page.url()).searchParams.get("token")).toBe("abc");
});

test("blocks turn on with empty hours", async ({ page }) => {
  const captured = await prepareSignedInBookingSettingsPage(page, {
    enabled: false,
  });

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  for (const name of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
    await dispatchClick(settingsDialog.getByRole("checkbox", { name }));
  }
  await dispatchClick(
    settingsDialog.getByRole("switch", { name: "Meeting page" }),
  );

  await expect(
    settingsDialog.getByRole("alert").filter({
      hasText: "Add weekly hours before turning on your meeting page.",
    }),
  ).toBeVisible();
  await expect(
    settingsDialog.getByRole("switch", { name: "Meeting page" }),
  ).toHaveAttribute("aria-checked", "false");
  expect(captured.putBodies.length).toBe(0);
});

test("changes the page address and PUTs slug", async ({ page }) => {
  const captured = await prepareSignedInBookingSettingsPage(page);

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await openMoreOptions(settingsDialog);
  await dispatchFill(settingsDialog.getByLabel("Page address"), "new-address");
  await dispatchClick(
    settingsDialog.getByRole("button", { name: "Save changes" }),
  );

  await expect.poll(() => captured.putBodies.length).toBe(1);
  expect(captured.putBodies[0]).toMatchObject({ slug: "new-address" });
});

test("essentials fit without scrolling at 1440x900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareSignedInBookingSettingsPage(page);

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  const summary = settingsDialog.getByText("More options", { exact: true });
  await expect(summary).toBeVisible();

  await scrollSettingsDialog(settingsDialog, 0);

  const dialogBox = await settingsDialog.boundingBox();
  const summaryBox = await summary.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(summaryBox).not.toBeNull();
  expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(
    dialogBox!.y + dialogBox!.height,
  );
});

test("settings dialog body scrolls on an inner wrapper", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await prepareSignedInBookingSettingsPage(page);
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await openMoreOptions(settingsDialog);
  const before = await scrollSettingsDialog(settingsDialog, 0);
  expect(before).toBe(0);
  const after = await scrollSettingsDialog(settingsDialog, 80);
  expect(after).toBeGreaterThan(0);
});

test("second hours line aligns with the first", async ({ page }) => {
  await prepareSignedInBookingSettingsPage(page);

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await dispatchClick(
    settingsDialog.getByRole("button", { name: "Add hours to Monday" }),
  );
  await expect(
    settingsDialog.getByRole("combobox", { name: "Monday start 2" }),
  ).toBeVisible();

  const mondayStart = settingsDialog.getByRole("combobox", {
    name: "Monday start",
    exact: true,
  });
  const mondayStart2 = settingsDialog.getByRole("combobox", {
    name: "Monday start 2",
    exact: true,
  });
  const mondayEnd = settingsDialog.getByRole("combobox", {
    name: "Monday end",
    exact: true,
  });
  const mondayEnd2 = settingsDialog.getByRole("combobox", {
    name: "Monday end 2",
    exact: true,
  });

  const startBox = await mondayStart.boundingBox();
  const start2Box = await mondayStart2.boundingBox();
  const endBox = await mondayEnd.boundingBox();
  const end2Box = await mondayEnd2.boundingBox();

  expect(startBox).not.toBeNull();
  expect(start2Box).not.toBeNull();
  expect(endBox).not.toBeNull();
  expect(end2Box).not.toBeNull();
  expect(start2Box!.x).toBe(startBox!.x);
  expect(start2Box!.width).toBe(startBox!.width);
  expect(end2Box!.x).toBe(endBox!.x);
  expect(end2Box!.width).toBe(endBox!.width);
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("opening More options and adding Monday hours does not move the dialog", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);

    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    const topBefore = (await settingsDialog.boundingBox())?.y;
    await openMoreOptions(settingsDialog);
    await dispatchClick(
      settingsDialog.getByRole("button", { name: "Add hours to Monday" }),
    );
    await expect(
      settingsDialog.getByRole("combobox", { name: "Monday start 2" }),
    ).toBeVisible();
    const topAfter = (await settingsDialog.boundingBox())?.y;
    expect(topAfter).toBe(topBefore);
  });
});

test("settings dialog never scrolls horizontally with more options open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareSignedInBookingSettingsPage(page);

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(
    settingsDialog.getByRole("combobox", { name: "Destination calendar" }),
  ).toHaveCount(0);
  await expect(
    settingsDialog.getByRole("button", { name: /Meeting timezone:/ }),
  ).toHaveCount(0);
  await openMoreOptions(settingsDialog);
  await expect(
    settingsDialog.getByRole("combobox", { name: "Destination calendar" }),
  ).toBeVisible();
  await settingsDialog
    .getByRole("button", { name: /Meeting timezone:/ })
    .click();

  const timezoneDialog = page.getByRole("dialog", { name: "Meeting timezone" });
  await dispatchFill(
    timezoneDialog.getByRole("combobox", { name: "Search meeting timezones" }),
    "Buenos Aires",
  );
  await timezoneDialog.getByRole("option", { name: /Buenos Aires/ }).click();
  await expect(
    settingsDialog.getByRole("button", { name: /Buenos Aires/ }),
  ).toBeVisible();

  const noHorizontalOverflow = async () => {
    const { scrollWidth, clientWidth } = await settingsDialog.evaluate(
      (el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }),
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  };

  await noHorizontalOverflow();
  await page.setViewportSize({ width: 1024, height: 768 });
  await noHorizontalOverflow();
});

test("keeps the meeting form visible when Google needs reconnecting", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, {
    connectionState: "RECONNECT_REQUIRED",
    enabled: true,
  });
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(
    settingsDialog.getByRole("switch", { name: "Meeting page" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    settingsDialog.getByRole("textbox", { name: "Meeting link" }),
  ).toBeVisible();
  await expect(settingsDialog.getByText(/needs reconnecting/)).toBeVisible();
  await expect(
    settingsDialog.getByRole("button", { name: "Reconnect Google Calendar" }),
  ).toBeVisible();
  await expectNoAxeViolations(page, {
    checkpoint: "settings booking reconnect banner",
    include: "[role='dialog']",
  });
});

test("shows why guests cannot book when a blocking calendar is stale", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, {
    pageStatus: {
      bookable: false,
      reasons: [
        {
          kind: "calendar",
          reason: "stale",
          calendarId: BOOKING_CALENDAR_ID,
        },
      ],
    },
  });
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(
    settingsDialog.getByText("Guests can't book right now"),
  ).toBeVisible();
  await expect(
    settingsDialog.getByText(
      "Work hasn't synced recently. Guests can book once it catches up.",
    ),
  ).toBeVisible();
  await expect(
    settingsDialog.getByRole("button", { name: /Meeting/ }),
  ).toContainText("needs attention");
  await expectNoAxeViolations(page, {
    checkpoint: "settings booking stale calendar status",
    include: "[role='dialog']",
  });
});

test("sidebar nudge opens Meeting settings and hides once the page is live", async ({
  page,
}) => {
  const captured = await prepareSignedInBookingSettingsPage(page, {
    configured: false,
    openSettings: false,
    completeOnboarding: true,
  });

  const nudge = page.getByRole("region", { name: "Meeting page" });
  await expect(nudge).toBeVisible();
  await nudge.getByRole("button", { name: "Set up meeting page" }).click();

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible();
  await expect(
    settingsDialog.getByRole("button", { name: "Meeting" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    settingsDialog
      .locator("p.text-text-muted")
      .filter({ hasText: /^Step 1 of \d+$/ }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(settingsDialog).toHaveCount(0);

  captured.setGetPayload({
    enabled: true,
    durationMinutes: 45,
    destinationCalendarId: BOOKING_CALENDAR_ID,
    blockingCalendarIds: [BOOKING_CALENDAR_ID],
    timeZone: "America/New_York",
    weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
    minNoticeHours: 4,
    maxHorizonDays: 60,
    id: "000000000000000000000001",
    slug: "hostuser",
    hostUserId: "000000000000000000000002",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    bookingUrl: "https://compasscalendar.com/meet/hostuser",
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { level: 1 }).getByRole("button"),
  ).toBeVisible({ timeout: 15000 });
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
  await page.waitForFunction(() => {
    const bridge = (
      window as Window & {
        __COMPASS_E2E_STORE__?: { userMetadata?: unknown };
      }
    ).__COMPASS_E2E_STORE__;
    return Boolean(bridge?.userMetadata);
  });
  await page.evaluate((metadata) => {
    const bridge = (
      window as Window & {
        __COMPASS_E2E_STORE__?: {
          userMetadata?: { set: (metadata: unknown) => void };
        };
      }
    ).__COMPASS_E2E_STORE__;
    bridge?.userMetadata?.set(metadata);
  }, captured.hostMetadata);

  await expect(page.getByRole("region", { name: "Meeting page" })).toHaveCount(
    0,
  );
});
