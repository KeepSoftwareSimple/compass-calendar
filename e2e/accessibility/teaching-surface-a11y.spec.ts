import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../utils/axe-assertion";
import {
  createEventTitle,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("the welcome dialog has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();

  await expectNoAxeViolations(page, {
    checkpoint: "welcome modal",
    include: '[role="dialog"][aria-label="Welcome to Compass Calendar"]',
  });
});

test("exploring without an account returns focus to the week view without trapping", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  await welcomeDialog
    .getByRole("button", { name: "Get started for free" })
    .click();
  await welcomeDialog.getByRole("button", { name: "Next" }).click();
  await welcomeDialog
    .getByRole("button", { name: "Explore without an account" })
    .click();
  await expect(welcomeDialog).toBeHidden();

  await page.keyboard.press("Tab");
  const active = page.locator(":focus");
  await expect(active).toBeVisible();
  await expect(active).not.toHaveAttribute(
    "aria-label",
    "Welcome to Compass Calendar",
  );
});

test("the sidebar Hide tips control is keyboard reachable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const hideTips = page.getByRole("button", { name: "Hide tips" });
  await expect(hideTips).toBeVisible({ timeout: 15000 });
  await hideTips.focus();
  await expect(hideTips).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(hideTips).toHaveCount(0);
});

test("a pointer-sourced teaching pill exposes status semantics without axe violations", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await prepareCalendarPage(page);

  const title = createEventTitle("Pointer A11y");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.click({ force: true });

  const pill = page.locator("[data-pointer-hint]");
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("Press");

  await expectNoAxeViolations(page, {
    checkpoint: "pointer intent pill",
    include: "[data-pointer-hint]",
  });
});

test("the shortcut level badge's open tooltip has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const badge = page.getByRole("button", { name: /Shortcut level/ });
  await expect(badge).toBeVisible({ timeout: 15000 });
  await badge.focus();
  await expect(page.getByRole("button", { name: "Hide level" })).toBeVisible();

  // The tooltip is portaled to the document body via floating-ui, so it
  // never lives inside the sidebar's own DOM subtree; `.c-tooltip` is the
  // real styling class on that portaled content, not a test-only hook.
  await expectNoAxeViolations(page, {
    checkpoint: "shortcut level badge tooltip",
    include: ".c-tooltip",
  });
});
