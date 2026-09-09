import { expect, type Page, test } from "@playwright/test";
import {
  buildBookableSlot,
  dispatchFill,
  formatMonthDayButtonLabel,
  formatSlotButtonLabel,
  preparePublicBookingCancelPage,
  preparePublicBookingConfirmedPage,
  preparePublicBookingPage,
  prepareSignedInBookingSettingsPage,
} from "./booking-harness";

async function guestTimeZone(page: Page): Promise<string> {
  return page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
}

test.describe("booking v1.5 escape and self-service", () => {
  test("returns to the picker on Escape from Your details", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your details" }),
    ).toBeFocused();
    await page.getByLabel("Name").fill("Guest User");

    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Your details" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/meet\/tylerdane/);
  });

  test("closes the timezone overlay on Escape without leaving Your details", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your details" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Timezone:/ }).click();
    await expect(page.getByRole("heading", { name: "Timezone" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { name: "Timezone" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("heading", { name: "Your details" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toHaveCount(0);
  });

  test("moves focus from a slot to the selected day on Escape", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);
    const timeZone = await guestTimeZone(page);
    const day = page.getByRole("button", {
      name: formatMonthDayButtonLabel(slotStart, timeZone),
    });
    const slot = page.getByRole("button", {
      name: formatSlotButtonLabel(slotStart, timeZone),
    });

    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
    await slot.focus();
    await expect(slot).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(day).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/meet\/tylerdane/);
  });

  test("does not leave the month grid on Escape", async ({ page }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);
    const timeZone = await guestTimeZone(page);
    const day = page.getByRole("button", {
      name: formatMonthDayButtonLabel(slotStart, timeZone),
    });

    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
    await day.focus();
    const href = page.url();

    await page.keyboard.press("Escape");

    await expect(day).toBeFocused();
    expect(page.url()).toBe(href);
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
  });

  test("returns to confirmation on Escape from cancel without posting", async ({
    page,
  }) => {
    const captured = await preparePublicBookingCancelPage(page);

    await expect(
      page.getByRole("heading", { name: "Cancel this meeting?" }),
    ).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      /\/meet\/confirmed\/000000000000000000000099\?token=abc$/,
    );
    await expect(
      page.getByRole("button", { name: "Edit details" }),
    ).toBeVisible();
    expect(captured.cancelPosts).toHaveLength(0);
  });

  test("edits name and notes from a cold tokenized confirmation permalink", async ({
    page,
  }) => {
    const captured = await preparePublicBookingConfirmedPage(page, {
      token: "abc",
      guestName: "Ada Lovelace",
      notes: "bring coffee",
    });

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();
    await expect(page).toHaveURL(
      /\/meet\/confirmed\/000000000000000000000099\?token=abc$/,
    );
    await expect(page.getByText("Ada Lovelace")).toBeVisible();
    await expect(page.getByText("bring coffee")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Cancel this meeting" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Edit details" }).click();

    await expect(
      page.getByRole("heading", { name: "Edit details" }),
    ).toBeFocused();
    await expect(page.getByLabel("Name")).toHaveValue("Ada Lovelace");
    await expect(page.getByLabel("Notes (optional)")).toHaveValue(
      "bring coffee",
    );
    await expect(page.getByLabel("Email")).toHaveCount(0);

    await page.getByLabel("Name").fill("Grace Hopper");
    await page.getByLabel("Notes (optional)").fill("bring tea");
    await page.getByRole("button", { name: "Save details" }).click();

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeVisible();
    await expect(page.getByText("Grace Hopper")).toBeVisible();
    await expect(page.getByText("bring tea")).toBeVisible();
    await expect(page.getByText("Ada Lovelace")).toHaveCount(0);
    expect(captured.reservationPatches).toEqual([
      { token: "abc", name: "Grace Hopper", notes: "bring tea" },
    ]);
  });

  test("returns from Edit details to confirmation on Escape without saving", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, {
      token: "abc",
      guestName: "Ada Lovelace",
      notes: "bring coffee",
    });

    await page.getByRole("button", { name: "Edit details" }).click();
    await expect(
      page.getByRole("heading", { name: "Edit details" }),
    ).toBeFocused();
    await page.getByLabel("Name").fill("Grace Hopper");

    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeVisible();
    await expect(page.getByText("Ada Lovelace")).toBeVisible();
    await expect(page.getByText("Grace Hopper")).toHaveCount(0);
    await expect(page).toHaveURL(
      /\/meet\/confirmed\/000000000000000000000099\?token=abc$/,
    );
  });
});

test.describe("booking v1.5 settings discard", () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test("Escape on dirty booking settings asks before discarding", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(settingsDialog.getByLabel("Duration")).toBeVisible();
    await settingsDialog.getByLabel("Duration").selectOption("30");
    await settingsDialog.getByText("More options", { exact: true }).click();
    await dispatchFill(
      settingsDialog.getByLabel("Minimum notice (hours)"),
      "8",
    );

    await page.keyboard.press("Escape");

    const discard = page.getByRole("dialog", {
      name: "Discard unsaved changes?",
    });
    await expect(discard).toBeVisible();
    await expect(settingsDialog).toBeVisible();
    await expect(settingsDialog.getByLabel("Duration")).toHaveValue("30");
    await expect(
      settingsDialog.getByLabel("Minimum notice (hours)"),
    ).toHaveValue("8");
  });
});
