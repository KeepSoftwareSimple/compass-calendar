import { expect, test } from "@playwright/test";
import path from "node:path";

const ARTIFACT_DIR = "/opt/cursor/artifacts";

const baseOnboardingScript = () => {
  localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
  localStorage.setItem("compass.onboarding.has-seen-shortcut-showcase", "true");
  localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  localStorage.setItem(
    "compass.life.preferences",
    JSON.stringify({
      birthDate: "1993-09-14",
      lifespan: 77,
      variation: "average",
    }),
  );
};

async function dismissLifeViewIntro(page: import("@playwright/test").Page) {
  const intro = page.getByRole("dialog", { name: "Life view" });
  const gotIt = page.getByRole("button", { name: "Got it" });
  try {
    await gotIt.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    return;
  }
  await gotIt.click();
  await expect(intro).toBeHidden({ timeout: 5_000 });
  // Closing animation keeps the backdrop mounted briefly (MODAL_DISMISS_MS).
  await expect(gotIt).toBeHidden({ timeout: 5_000 });
}

async function openLifeSidebar(page: import("@playwright/test").Page) {
  const openSidebar = page.getByRole("button", { name: "Open sidebar" });
  if (await openSidebar.isVisible()) {
    await openSidebar.click();
  }
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Date of birth" }),
  ).toBeVisible();
}

async function expectYearCaptionMatchesCells(
  popper: import("@playwright/test").Locator,
) {
  const yearTexts = await popper
    .locator(".react-datepicker__year-text")
    .allTextContents();
  const years = yearTexts
    .map((label) => Number.parseInt(label, 10))
    .filter((y) => Number.isFinite(y));
  expect(years.length).toBeGreaterThan(0);
  const caption = popper.getByText(/^Years \d+ to \d+$/);
  await expect(caption).toBeVisible();
  const captionText = (await caption.textContent())?.trim() ?? "";
  const match = /^Years (\d+) to (\d+)$/.exec(captionText);
  expect(match).not.toBeNull();
  expect(Number(match![1])).toBe(years[0]);
  expect(Number(match![2])).toBe(years[years.length - 1]);
}

type BoundingBox = { x: number; y: number; width: number; height: number };

const boxesOverlap = (a: BoundingBox, b: BoundingBox): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

async function expectPageJumpChipClearsTargets(
  page: import("@playwright/test").Page,
  digit: string,
  targets: import("@playwright/test").Locator[],
) {
  const chips = page.locator("[data-page-jump-hints] [aria-hidden] > span");
  await expect(chips.first()).toBeVisible();
  const count = await chips.count();
  let chipBox: BoundingBox | null = null;
  for (let i = 0; i < count; i++) {
    const chip = chips.nth(i);
    if ((await chip.textContent())?.trim() === digit) {
      chipBox = await chip.boundingBox();
      break;
    }
  }
  expect(chipBox).not.toBeNull();
  for (const target of targets) {
    await expect(target).toBeVisible();
    const targetBox = await target.boundingBox();
    expect(targetBox).not.toBeNull();
    expect(boxesOverlap(chipBox!, targetBox!)).toBe(false);
  }
}

async function assertLifeVariationChipLayout(
  page: import("@playwright/test").Page,
) {
  await expectPageJumpChipClearsTargets(page, "3", [
    page.getByRole("button", {
      name: "Previous life variation in sidebar",
    }),
    page.getByRole("button", { name: "Next life variation in sidebar" }),
    page.getByRole("heading", { name: "Average" }),
  ]);
}

async function holdModForHints(page: import("@playwright/test").Page) {
  await page.locator("#mainSection").focus();
  await page.keyboard.down("ControlOrMeta");
  await expect(page.locator("[data-page-jump-hints]")).toBeVisible({
    timeout: 3_000,
  });
  await expect
    .poll(
      async () => page.locator("[data-page-jump-hints] .c-keycap").count(),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(3);
}

test.describe("life ux evidence 0084", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@artifact life mod hints and datepicker modes", async ({ page }) => {
    test.setTimeout(180_000);

    await page.addInitScript(baseOnboardingScript);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/life", { waitUntil: "domcontentloaded" });
    await dismissLifeViewIntro(page);
    await openLifeSidebar(page);

    await holdModForHints(page);
    await assertLifeVariationChipLayout(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "life-mod-hints-sidebar-wide.png"),
    });
    await page.keyboard.up("ControlOrMeta");

    await page.keyboard.down("ControlOrMeta");
    await page.keyboard.press("4");
    await page.keyboard.up("ControlOrMeta");
    const birth = page.getByRole("textbox", { name: "Date of birth" });
    await expect(birth).toBeFocused();

    await birth.click();
    const popper = page.locator(
      ".react-datepicker-popper:has(.lifeBirthDatePicker)",
    );
    await expect(popper).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("date-picker-contextual-hint")).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "life-datepicker-day-hints-wide-light.png"),
    });

    await popper.getByRole("button", { name: "Choose month and year" }).click();
    await expectYearCaptionMatchesCells(popper);
    await expect(popper.getByText("Years 1981 to 2000")).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "life-datepicker-year-grid-wide.png"),
    });
    await popper.getByRole("button", { name: "Previous years" }).click();
    await expectYearCaptionMatchesCells(popper);
    await expect(popper.getByText("Years 1961 to 1980")).toBeVisible();
    await popper.getByRole("button", { name: "Next years" }).click();
    await expectYearCaptionMatchesCells(popper);
    await expect(popper.getByText("Years 1981 to 2000")).toBeVisible();

    await popper
      .locator(".react-datepicker__year-text", { hasText: "1993" })
      .click();
    await expect(popper.getByText("Select month, 1993")).toBeVisible();
    await page.screenshot({
      path: path.join(
        ARTIFACT_DIR,
        "life-datepicker-month-grid-wide-light.png",
      ),
    });

    await page.evaluate(() => {
      localStorage.setItem("compass.theme", "dark-abyss");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissLifeViewIntro(page);
    await openLifeSidebar(page);
    await birth.click();
    await expect(popper).toBeVisible();
    await popper.getByRole("button", { name: "Choose month and year" }).click();
    await expect(popper.getByText(/Years \d+ to \d+/)).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "life-datepicker-year-grid-wide-dark.png"),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissLifeViewIntro(page);
    await openLifeSidebar(page);
    await holdModForHints(page);
    await assertLifeVariationChipLayout(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "life-mod-hints-sidebar-narrow.png"),
    });
    await page.keyboard.up("ControlOrMeta");
    await birth.scrollIntoViewIfNeeded();
    await birth.click();
    await expect(popper).toBeVisible();
    await expect(page.locator("#sidebar")).toBeInViewport();
    await page.screenshot({
      path: path.join(
        ARTIFACT_DIR,
        "life-datepicker-day-narrow-with-sidebar.png",
      ),
    });
    await popper.getByRole("button", { name: "Choose month and year" }).click();
    await expectYearCaptionMatchesCells(popper);
    await page.screenshot({
      path: path.join(
        ARTIFACT_DIR,
        "life-datepicker-year-grid-narrow-with-sidebar.png",
      ),
    });
  });
});
