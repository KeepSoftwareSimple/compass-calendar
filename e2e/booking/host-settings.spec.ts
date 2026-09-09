import { expect, type Locator, test } from "@playwright/test";
import { DEFAULT_WEEKLY_AVAILABILITY } from "@core/types/booking.contracts";
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
  await settingsDialog.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

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

  await settingsDialog.evaluate((el) => {
    el.scrollTop = 0;
  });

  const dialogBox = await settingsDialog.boundingBox();
  const summaryBox = await summary.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(summaryBox).not.toBeNull();
  expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(
    dialogBox!.y + dialogBox!.height,
  );
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

test("second hours line aligns with the first", async ({ page }) => {
  await prepareSignedInBookingSettingsPage(page);

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await dispatchClick(
    settingsDialog.getByRole("button", { name: "Add hours to Monday" }),
  );
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
  await expect(mondayStart2).toBeVisible();

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

test("settings dialog never scrolls horizontally with more options open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareSignedInBookingSettingsPage(page);

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(
    settingsDialog.getByRole("button", { name: /Meeting timezone:/ }),
  ).toHaveCount(0);
  await openMoreOptions(settingsDialog);
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
