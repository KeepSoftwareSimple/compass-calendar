import { expect, type Locator, type Page, test } from "@playwright/test";
import { ensureSidebarOpen } from "../utils/event-test-utils";

type LayoutBox = { x: number; y: number; width: number; height: number };

const MIN_NOTICE_GAP_PX = 8;

function boxesIntersect(a: LayoutBox, b: LayoutBox): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  return !(aRight <= b.x || a.x >= bRight || aBottom <= b.y || a.y >= bBottom);
}

function isFullyInViewport(
  box: LayoutBox,
  viewport: { width: number; height: number },
) {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= viewport.width + 1 &&
    box.y + box.height <= viewport.height + 1
  );
}

function verticalGapPx(upper: LayoutBox, lower: LayoutBox): number {
  return lower.y - (upper.y + upper.height);
}

async function prepareSession(page: Page) {
  await page.route(/version\.json(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: "99.99.99" }),
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.removeItem("compass.onboarding.first-event-done");
    localStorage.removeItem("compass.app-update.notice-handled-versions");
  });
}

async function ensureUpdateToastVisible(page: Page) {
  const updateToast = page.locator(
    ".Toastify__toast.app-update-available-toast-host",
  );

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await updateToast.isVisible()) return;
    await page.waitForTimeout(500);
  }

  await page.evaluate(() => {
    localStorage.removeItem("compass.app-update.notice-handled-versions");
    const helpers = (
      window as Window & {
        __compassE2E?: {
          showAppUpdateAvailableToast: (version: string) => void;
        };
      }
    ).__compassE2E;
    helpers?.showAppUpdateAvailableToast("99.99.99");
  });

  await expect(updateToast).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Compass just got better. Refresh to update."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Refresh/i })).toBeVisible();
}

async function openWeekWithNotices(page: Page) {
  const firstEvent = page.getByRole("complementary", {
    name: "Create your first event",
  });

  await page.goto("/week", { waitUntil: "networkidle" });
  await expect(firstEvent).toBeVisible({ timeout: 120_000 });
  await ensureUpdateToastVisible(page);
}

function noticeLocators(page: Page): Locator[] {
  return [
    page.locator(".Toastify__toast.app-update-available-toast-host"),
    page.getByRole("complementary", { name: "Create your first event" }),
  ];
}

async function assertBottomLeftStack(page: Page) {
  const stack = page.locator("section.compass-bottom-notice-stack");
  await expect(stack).toBeVisible();

  const stackBox = await stack.boundingBox();
  expect(stackBox).not.toBeNull();
  if (!stackBox) throw new Error("Expected bottom notice stack box");

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) throw new Error("Expected viewport");

  expect(stackBox.x).toBeLessThan(viewport.width * 0.35);
  expect(isFullyInViewport(stackBox, viewport)).toBe(true);
}

async function assertPrimaryCtas(page: Page) {
  const refresh = page.getByRole("button", { name: /^Refresh/i });
  const addCoffee = page.getByRole("button", { name: "Add event" });
  await expect(refresh).toBeVisible();
  await expect(addCoffee).toBeVisible();

  await expect(refresh).toHaveClass(/c-button-primary/);
  await expect(addCoffee).toHaveClass(/c-button-primary/);
}

async function waitForNoticesFullyInViewport(page: Page, notices: Locator[]) {
  await expect
    .poll(
      async () => {
        const viewport = page.viewportSize();
        if (!viewport) return false;

        for (const notice of notices) {
          if (!(await notice.isVisible())) return false;
          const box = await notice.boundingBox();
          if (!box || box.width <= 0 || box.height <= 0) return false;
          if (!isFullyInViewport(box, viewport)) return false;
        }

        return true;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function assertNoticeStackLayout(page: Page) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) throw new Error("Expected viewport");

  const notices = noticeLocators(page);
  await waitForNoticesFullyInViewport(page, notices);

  const boxes: LayoutBox[] = [];

  for (const notice of notices) {
    await expect(notice).toBeVisible();
    const box = await notice.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("Expected notice bounding box");
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(isFullyInViewport(box, viewport)).toBe(true);
    boxes.push(box);
  }

  expect(boxes.length).toBeGreaterThanOrEqual(2);

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      expect(boxesIntersect(boxes[i], boxes[j])).toBe(false);
    }
  }

  const [updateBox, firstEventBox] = boxes;
  expect(updateBox.y + updateBox.height).toBeLessThanOrEqual(
    firstEventBox.y - MIN_NOTICE_GAP_PX + 1,
  );
  expect(verticalGapPx(updateBox, firstEventBox)).toBeGreaterThanOrEqual(
    MIN_NOTICE_GAP_PX,
  );
}

/**
 * Tyler's rule: the lowest bottom-left notice sits as far from the viewport
 * bottom as from its left edge, unless something real (sidebar footer, Up Next
 * banner) is under the stack.
 */
async function assertBottomGapMatchesLeftGap(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Expected viewport");
  const notices = noticeLocators(page);
  await waitForNoticesFullyInViewport(page, notices);

  await expect
    .poll(
      async () => {
        const boxes: LayoutBox[] = [];
        for (const notice of notices) {
          const box = await notice.boundingBox();
          if (box) boxes.push(box);
        }
        const lowest = boxes.reduce((a, b) =>
          b.y + b.height > a.y + a.height ? b : a,
        );
        const bottomGap = viewport.height - (lowest.y + lowest.height);
        return Math.abs(Math.round(bottomGap) - Math.round(lowest.x));
      },
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(1);
}

test.describe("bottom notice stack", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto("about:blank");
  });

  test("1280px anchors notices bottom-left with primary CTAs and no overlap", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareSession(page);
    await openWeekWithNotices(page);

    await assertBottomLeftStack(page);
    await assertPrimaryCtas(page);
    await assertNoticeStackLayout(page);

    if (process.env.BOTTOM_NOTICE_CAPTURE === "1") {
      await page.screenshot({
        path: "/opt/cursor/artifacts/bottom-notice-stack-1280.png",
        fullPage: false,
      });
    }
  });

  test("360px anchors notices bottom-left with primary CTAs and no overlap", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    await page.setViewportSize({ width: 360, height: 740 });
    await prepareSession(page);
    await openWeekWithNotices(page);

    await assertBottomLeftStack(page);
    await assertPrimaryCtas(page);
    await assertNoticeStackLayout(page);

    if (process.env.BOTTOM_NOTICE_CAPTURE === "1") {
      await page.screenshot({
        path: "/opt/cursor/artifacts/bottom-notice-stack-360.png",
        fullPage: false,
      });
    }
  });

  for (const width of [360, 560, 1280]) {
    test(`${width}px keeps the bottom gap equal to the left gap`, async ({
      page,
    }, testInfo) => {
      testInfo.setTimeout(240_000);
      await page.setViewportSize({ width, height: 800 });
      await prepareSession(page);
      await openWeekWithNotices(page);

      await assertBottomGapMatchesLeftGap(page);
    });
  }

  test("1280px with the right sidebar open keeps the bottom gap equal to the left gap", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepareSession(page);
    await openWeekWithNotices(page);
    await ensureSidebarOpen(page);

    await expect(
      page.locator("section.compass-bottom-notice-stack"),
    ).not.toHaveAttribute("data-clears-sidebar-footer", "true");
    await assertBottomGapMatchesLeftGap(page);
  });
});
