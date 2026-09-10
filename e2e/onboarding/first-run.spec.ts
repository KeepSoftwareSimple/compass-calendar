import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
} from "../utils/event-test-utils";

// Most E2E coverage skips onboarding to keep the calendar tests focused. This
// spec deliberately starts with empty browser storage so a new user's path is
// exercised end to end. Shortcut Showcase itself is covered in
// shortcut-showcase.spec.ts — here the no-account path is the focus, so
// sample events and create persistence get the attention.
test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("welcomes a first-time user and seeds sample events", async ({
  page,
}, testInfo) => {
  // The added first-event-prompt assertions wait out its 4s celebration
  // before the reload, on top of the seeding + create + reload this test
  // already did.
  testInfo.setTimeout(45_000);
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();

  // The welcome overlay is the one calendar surface where the mouse works,
  // so the first screen's only action is proven by a real click. Escape
  // steps back a screen; the second Enter reaches the auth choices.
  await welcomeDialog
    .getByRole("button", { name: "Get started for free" })
    .click();
  await expect(
    welcomeDialog.getByRole("button", { name: "Who is Compass for?" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    welcomeDialog.getByRole("button", { name: "Get started for free" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  // The welcome modal advertises S for this action; prove the shortcut.
  await expect(
    welcomeDialog.getByRole("button", { name: "Explore without an account" }),
  ).toBeVisible();
  await page.keyboard.press("s");
  await expect(welcomeDialog).toBeHidden();

  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(showcase).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(showcase).toContainText("Press Esc again to leave practice.");
  await page.keyboard.press("Escape");
  await expect(showcase).toHaveCount(0);

  await expect(
    page.getByText(/Sample events to help you explore/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Sample Timed event: Try Compass/i }),
  ).toBeVisible();

  const prompt = page.getByRole("complementary", {
    name: "Create your first event",
  });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Add your first event");

  const title = createEventTitle("First-run event");
  await openTimedEventFormWithKeyboard(page);
  await expect(prompt).toBeHidden();
  await fillTitleAndSaveEventForm(page, title);

  // The prompt celebrates the first real event, then retires.
  await expect(prompt).toContainText("It's on the calendar.");
  await expect(prompt).toBeHidden();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(welcomeDialog).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Shortcut practice" }),
  ).toHaveCount(0);
  await expectTimedEventVisible(page, title);
  // Completion persisted across the reload; the prompt does not come back.
  await expect(
    page.getByRole("complementary", { name: "Create your first event" }),
  ).toHaveCount(0);
});
