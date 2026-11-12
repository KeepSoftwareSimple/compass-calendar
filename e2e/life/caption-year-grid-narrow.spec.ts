import { expect, test } from "@playwright/test";

async function openLifeBirthYearGrid(page: import("@playwright/test").Page) {
  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();

  const openSidebar = page.getByRole("button", { name: "Open sidebar" });
  if (await openSidebar.isVisible()) {
    await openSidebar.click();
  }

  const birth = page.getByRole("textbox", { name: "Date of birth" });
  await birth.focus();
  await birth.press("ArrowDown");

  const popper = page.locator(
    ".react-datepicker-popper:has(.lifeBirthDatePicker)",
  );
  await expect(popper).toBeVisible({ timeout: 15000 });

  const caption = popper.getByRole("button", {
    name: "Choose month and year",
  });
  await caption.click();

  await expect(popper.getByText("Years 1981 to 2000")).toBeVisible({
    timeout: 15000,
  });
}

for (const { name, stored } of [
  { name: "light", stored: "light-beach" },
  { name: "dark", stored: "dark-abyss" },
] as const) {
  test(`life birth date picker year grid fits 360px sidebar (${name})`, async ({
    page,
  }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("compass.theme", theme);
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
      localStorage.setItem("compass.view.sidebar-open", "true");
      localStorage.setItem(
        "compass.life.preferences",
        JSON.stringify({
          birthDate: "1993-09-14",
          lifespan: 79,
          variation: "average",
        }),
      );
    }, stored);

    await page.setViewportSize({ width: 360, height: 720 });
    await openLifeBirthYearGrid(page);

    const popper = page.locator(
      ".react-datepicker-popper:has(.lifeBirthDatePicker)",
    );

    await expect(popper.locator(".react-datepicker__year-text")).toHaveCount(
      20,
    );
    const years = await popper
      .locator(".react-datepicker__year-text")
      .allTextContents();
    expect(years.map((y) => Number.parseInt(y.trim(), 10))).toEqual(
      expect.arrayContaining([1981, 2000]),
    );

    const withinViewport = await popper.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return b.left >= 0 && b.right <= window.innerWidth;
    });
    expect(withinViewport).toBe(true);
    await expect(popper.getByText("Years 1981 to 2000")).toBeVisible();
  });
}
