import { expect, type Page, test } from "@playwright/test";

type LayoutBox = { x: number; y: number; width: number; height: number };

function boxesIntersect(a: LayoutBox, b: LayoutBox): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  return !(aRight <= b.x || a.x >= bRight || aBottom <= b.y || a.y >= bBottom);
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

async function completeWelcomeIfPresent(page: Page) {
  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  if (!(await welcomeDialog.isVisible().catch(() => false))) {
    return;
  }

  await welcomeDialog
    .getByRole("button", { name: "Get started for free" })
    .click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("s");
  await expect(welcomeDialog).toBeHidden({ timeout: 30_000 });
}

async function openWeekWithNotices(page: Page) {
  await page.goto("/week", { waitUntil: "networkidle" });
  await completeWelcomeIfPresent(page);

  const firstEvent = page.getByRole("complementary", {
    name: "Create your first event",
  });
  await expect(firstEvent).toBeVisible({ timeout: 60_000 });

  const updateCopy = page.getByText(
    "Compass just got better. Refresh to update.",
  );
  if (!(await updateCopy.isVisible().catch(() => false))) {
    await page.reload({ waitUntil: "networkidle" });
  }
  await expect(updateCopy).toBeVisible({ timeout: 90_000 });
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
  expect(stackBox.y + stackBox.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function assertPrimaryCtas(page: Page) {
  const refresh = page.getByRole("button", { name: /^Refresh/i });
  const addCoffee = page.getByRole("button", { name: "Add Coffee" });
  await expect(refresh).toBeVisible();
  await expect(addCoffee).toBeVisible();

  await expect(refresh).toHaveClass(/c-button-primary/);
  await expect(addCoffee).toHaveClass(/c-button-primary/);
}

async function assertNoticesDoNotOverlap(page: Page) {
  const stackChildren = page.locator("section.compass-bottom-notice-stack > *");
  const count = await stackChildren.count();
  expect(count).toBeGreaterThanOrEqual(2);

  const boxes: LayoutBox[] = [];
  for (let i = 0; i < count; i += 1) {
    const box = await stackChildren.nth(i).boundingBox();
    expect(box).not.toBeNull();
    if (box) boxes.push(box);
  }

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      expect(boxesIntersect(boxes[i], boxes[j])).toBe(false);
    }
  }
}

test.describe("bottom notice stack", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });

  test("1280px anchors notices bottom-left with primary CTAs and no overlap", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareSession(page);
    await openWeekWithNotices(page);

    await assertBottomLeftStack(page);
    await assertPrimaryCtas(page);
    await assertNoticesDoNotOverlap(page);
  });

  test("360px anchors notices bottom-left with primary CTAs and no overlap", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 740 });
    await prepareSession(page);
    await openWeekWithNotices(page);

    await assertBottomLeftStack(page);
    await assertPrimaryCtas(page);
    await assertNoticesDoNotOverlap(page);
  });
});
