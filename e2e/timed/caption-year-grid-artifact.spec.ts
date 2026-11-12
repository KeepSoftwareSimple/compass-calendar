import { expect, test } from "@playwright/test";

const ARTIFACT_PREFIX = "/opt/cursor/artifacts/caption-year-grid";

async function openLifeBirthYearGrid(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
    localStorage.setItem("compass.view.sidebar-open", "true");
    localStorage.setItem(
      "compass.life.preferences",
      JSON.stringify({
        birthDate: "1993-09-14",
        lifespan: 79,
        variation: "average",
      }),
    );
  });

  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();

  const openSidebar = page.getByRole("button", { name: "Open sidebar" });
  if (await openSidebar.isVisible()) {
    await openSidebar.click();
  }

  const birth = page.getByRole("textbox", { name: "Date of birth" });
  await birth.click();
  await birth.press("ArrowDown");

  const popper = page.locator(
    ".react-datepicker-popper:has(.lifeBirthDatePicker)",
  );
  await expect(popper).toBeVisible();

  const caption = popper.getByRole("button", {
    name: "Choose month and year",
  });
  await caption.click();
  await caption.click();

  await expect(popper.getByText("Years 1981 to 2000")).toBeVisible();
  const years = await popper.getByRole("option").allTextContents();
  expect(years.filter((y) => /^\d{4}$/.test(y.trim()))).toHaveLength(20);
  expect(
    years.map((y) => Number.parseInt(y.trim(), 10)).filter(Boolean),
  ).toEqual(expect.arrayContaining([1981, 2000]));
}

for (const { name, stored } of [
  { name: "light", stored: "light-beach" },
  { name: "dark", stored: "dark-abyss" },
] as const) {
  test(`artifact: caption year grid (${name}, narrow sidebar)`, {
    tag: "@artifact",
  }, async ({ page }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("compass.theme", theme);
    }, stored);

    await page.setViewportSize({ width: 360, height: 720 });
    await openLifeBirthYearGrid(page);

    await page.locator("#sidebar").screenshot({
      path: `${ARTIFACT_PREFIX}-web-${name}-360.png`,
    });
  });
}
