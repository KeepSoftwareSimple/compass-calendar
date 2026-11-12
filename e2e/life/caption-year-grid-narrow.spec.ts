import { expect, test } from "@playwright/test";

async function openLifeBirthYearGrid(page: import("@playwright/test").Page) {
  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();

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

    const sidebar = page.locator("#sidebar");
    const popper = page.locator(
      ".react-datepicker-popper:has(.lifeBirthDatePicker)",
    );

    const yearLabels = await popper
      .getByRole("option")
      .filter({ hasText: /^\d{4}$/ })
      .allTextContents();
    expect(yearLabels).toHaveLength(20);
    expect(yearLabels.map((y) => Number.parseInt(y, 10))).toEqual(
      expect.arrayContaining([1981, 2000]),
    );

    const fitsSidebar = await page.evaluate(() => {
      const sidebarEl = document.querySelector("#sidebar");
      const popperEl = document.querySelector(
        ".react-datepicker-popper:has(.lifeBirthDatePicker)",
      );
      if (
        !(sidebarEl instanceof HTMLElement) ||
        !(popperEl instanceof HTMLElement)
      ) {
        return { ok: false, reason: "missing nodes" };
      }
      const sb = sidebarEl.getBoundingClientRect();
      const caption = popperEl.querySelector<HTMLElement>(
        ".react-datepicker__current-month, [class*='caption']",
      );
      const grid = popperEl.querySelector<HTMLElement>(
        ".react-datepicker__year",
      );
      const check = (el: HTMLElement | null, name: string) => {
        if (!el) return `${name} missing`;
        const b = el.getBoundingClientRect();
        if (b.left < sb.left - 1 || b.right > sb.right + 1) {
          return `${name} overflows sidebar (${b.left.toFixed(0)}..${b.right.toFixed(0)} vs ${sb.left.toFixed(0)}..${sb.right.toFixed(0)})`;
        }
        return null;
      };
      const err = check(caption, "caption") ?? check(grid, "year grid") ?? null;
      return err ? { ok: false as const, reason: err } : { ok: true as const };
    });

    expect(fitsSidebar).toEqual({ ok: true });
    await expect(sidebar.getByText("Years 1981 to 2000")).toBeVisible();
  });
}
