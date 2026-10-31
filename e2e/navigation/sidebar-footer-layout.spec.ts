import { expect, test } from "@playwright/test";
import {
  ensureSidebarOpen,
  prepareCalendarPage,
} from "../utils/event-test-utils";

/** Tailwind `gap-2` between contiguous footer controls (8px). */
const MAX_FOOTER_GAP_PX = 12;

const measureFooterGaps = async (page: import("@playwright/test").Page) => {
  const group = page.getByTestId("sidebar-footer-actions");
  await expect(group).toBeVisible();

  return group.evaluate((root) => {
    const boxes = Array.from(root.children).map((child) => {
      const control = child.querySelector("button") ?? child;
      const rect = control.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });

    const gaps: number[] = [];
    for (let index = 1; index < boxes.length; index += 1) {
      gaps.push(boxes[index].left - boxes[index - 1].right);
    }

    return { boxes, gaps };
  });
};

const assertContiguousFooter = async (
  page: import("@playwright/test").Page,
) => {
  const { gaps } = await measureFooterGaps(page);
  expect(gaps.length).toBeGreaterThan(0);
  for (const gap of gaps) {
    expect(gap).toBeGreaterThanOrEqual(-1);
    expect(gap).toBeLessThanOrEqual(MAX_FOOTER_GAP_PX);
  }
};

test.describe("sidebar footer actions layout", () => {
  test("footer controls stay contiguous at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepareCalendarPage(page);
    await assertContiguousFooter(page);
  });

  test("footer controls stay contiguous at 360px with the sidebar open", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
      localStorage.setItem("compass.view.sidebar-open", "true");
    });
    await page.setViewportSize({ width: 360, height: 800 });
    await prepareCalendarPage(page);
    await ensureSidebarOpen(page);
    await assertContiguousFooter(page);
  });
});
