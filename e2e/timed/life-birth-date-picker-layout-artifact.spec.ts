import { expect, test } from "@playwright/test";

const ARTIFACT_PREFIX = "/opt/cursor/artifacts/life-birth-date-picker";

/** September 1993 has 6 week rows; 26 is in the bottom row (Sun). */
const isBottomDayVisible = async (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const popper = document.querySelector(".react-datepicker-popper");
    if (!popper) return { ok: false, reason: "no popper" };

    const cells = [...popper.querySelectorAll(".react-datepicker__day")];
    const day26 = cells.find((cell) => cell.textContent?.trim() === "26");
    if (!day26) return { ok: false, reason: "day 26 missing" };

    const cellRect = day26.getBoundingClientRect();
    const popperRect = popper.getBoundingClientRect();
    const epsilon = 1;
    if (cellRect.bottom > popperRect.bottom + epsilon) {
      return { ok: false, reason: "bottom clipped" };
    }

    return { ok: true };
  });

test("artifact: life birth date picker layout and grid not clipped", {
  tag: "@artifact",
}, async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
    localStorage.setItem("compass.view.sidebar-open", "true");
  });

  const runCapture = async (suffix: string) => {
    await page.goto("/life", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();

    const openSidebar = page.getByRole("button", { name: "Open sidebar" });
    if (await openSidebar.isVisible()) {
      await openSidebar.click();
    }

    const birth = page.getByRole("textbox", { name: "Date of birth" });
    await birth.click();
    await birth.fill("1993-09-14");
    await birth.press("ArrowDown");

    await expect(page.locator(".lifeBirthDatePicker")).toBeVisible();
    await expect(
      page.getByTestId("life-birth-date-calendar-hint"),
    ).toBeVisible();
    await expect(page.getByText("Sep 1993")).toBeVisible();

    expect((await isBottomDayVisible(page)).ok).toBe(true);

    await page.screenshot({
      path: `${ARTIFACT_PREFIX}-${suffix}.png`,
      fullPage: false,
    });
  };

  await page.setViewportSize({ width: 420, height: 520 });
  await runCapture("normal");

  await page.setViewportSize({ width: 360, height: 320 });
  await runCapture("constrained-height");
});
