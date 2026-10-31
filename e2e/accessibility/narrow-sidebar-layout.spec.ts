import { expect, test } from "@playwright/test";
import {
  ensureSidebarOpen,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const expectNoHorizontalOverflow = async (
  page: import("@playwright/test").Page,
) => {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
};

test("week sidebar fits a 360px viewport without horizontal overflow", async ({
  page,
}) => {
  await prepareCalendarPage(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await ensureSidebarOpen(page);
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator("#mainGrid")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("life sidebar fits a 360px viewport without horizontal overflow", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
    localStorage.setItem("compass.view.sidebar-open", "true");
  });
  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator("#sidebar")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
