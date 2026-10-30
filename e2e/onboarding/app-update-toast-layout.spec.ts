import { expect, type Page, test } from "@playwright/test";

type LayoutBox = { x: number; y: number; width: number; height: number };

function boxesIntersect(a: LayoutBox, b: LayoutBox): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  return !(aRight <= b.x || a.x >= bRight || aBottom <= b.y || a.y >= bBottom);
}

function isWithinOuter(
  inner: LayoutBox,
  outer: LayoutBox,
  tolerancePx = 1,
): boolean {
  const innerRight = inner.x + inner.width;
  const innerBottom = inner.y + inner.height;
  const outerRight = outer.x + outer.width;
  const outerBottom = outer.y + outer.height;
  return (
    inner.x >= outer.x - tolerancePx &&
    innerRight <= outerRight + tolerancePx &&
    inner.y >= outer.y - tolerancePx &&
    innerBottom <= outerBottom + tolerancePx
  );
}

async function showAppUpdateToast(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("compass.app-update.notice-handled-versions");
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await page.route("**/version.json*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: "99.99.99" }),
    });
  });

  await page.goto("/week", { waitUntil: "networkidle" });

  await expect(
    page.getByText("Compass just got better. Refresh to update."),
  ).toBeVisible({ timeout: 60_000 });
}

async function assertToastControlsFitHost(page: Page) {
  const host = page.locator(".Toastify__toast.app-update-available-toast-host");
  await expect(host).toBeVisible();

  const hostBox = await host.boundingBox();
  const dismissBox = await page
    .getByRole("button", { name: "Dismiss update notice" })
    .boundingBox();
  const keysBox = await page
    .locator(".app-update-available-toast-keys")
    .boundingBox();

  expect(hostBox).not.toBeNull();
  expect(dismissBox).not.toBeNull();
  expect(keysBox).not.toBeNull();

  if (!hostBox || !dismissBox || !keysBox) {
    throw new Error("Expected toast layout boxes");
  }

  expect(isWithinOuter(dismissBox, hostBox)).toBe(true);
  expect(isWithinOuter(keysBox, hostBox)).toBe(true);
  expect(boxesIntersect(dismissBox, keysBox)).toBe(false);
}

test.describe("app update toast layout", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("1280px keeps keycaps and dismiss inside the toast chrome", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await showAppUpdateToast(page);
    await assertToastControlsFitHost(page);
  });

  test("360px keeps keycaps and dismiss inside the toast chrome", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await showAppUpdateToast(page);
    await assertToastControlsFitHost(page);
  });
});
