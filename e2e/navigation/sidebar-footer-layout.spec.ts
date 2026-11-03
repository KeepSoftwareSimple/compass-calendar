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

const assertFooterActionsReceivePointerHits = async (
  page: import("@playwright/test").Page,
) => {
  const hitShortcuts = await page.evaluate(() => {
    const button = document.querySelector(
      '[data-testid="sidebar-footer-actions"] button[aria-label^="Open shortcuts"]',
    );
    if (!button) return { ok: false, reason: "missing button" };
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      ok: top === button || button.contains(top),
      reason:
        top instanceof HTMLElement
          ? top.tagName +
            (top.getAttribute("aria-label") ?? top.className.slice(0, 40))
          : "null",
    };
  });
  expect(hitShortcuts.ok, hitShortcuts.reason).toBe(true);
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
    await assertFooterActionsReceivePointerHits(page);
  });

  test("footer controls stay clickable at 360px when bottom notices are showing", async ({
    page,
  }) => {
    await page.route(/version\.json(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "99.99.99" }),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.removeItem("compass.onboarding.first-event-done");
      localStorage.setItem(
        "compass.onboarding.has-seen-shortcut-showcase",
        "true",
      );
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
    });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/week", { waitUntil: "networkidle" });
    await ensureSidebarOpen(page);
    await expect(
      page.getByRole("complementary", { name: "Create your first event" }),
    ).toBeVisible();
    await expect(
      page.locator("section.compass-bottom-notice-stack"),
    ).toHaveAttribute("data-clears-sidebar-footer", "true");
    await assertContiguousFooter(page);
    await assertFooterActionsReceivePointerHits(page);
  });
});
