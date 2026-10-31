import { expect, type Locator, type Page, test } from "@playwright/test";
import { BOTTOM_NOTICE_DESKTOP_WIDTH_PX } from "../../apps/calendar-web/src/components/BottomNoticeStack/bottom-notice.constants";

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

async function showAppUpdateNotice(page: Page) {
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
}

async function openWeek(page: Page) {
  await page.goto("/week", { waitUntil: "networkidle" });
}

async function assertSingleNotice(page: Page) {
  await expect(page.locator("[data-notice]")).toHaveCount(1, {
    timeout: 15_000,
  });
}

async function readMessageAndButtonStyle(notice: Locator) {
  return notice.evaluate((root) => {
    const message = root.querySelector("p");
    const buttonLabel = root.querySelector(".c-notice-primary-label");
    const read = (el: Element | null) =>
      el
        ? {
            fontSize: getComputedStyle(el).fontSize,
            fontWeight: getComputedStyle(el).fontWeight,
          }
        : null;
    return { message: read(message), buttonLabel: read(buttonLabel) };
  });
}

async function assertNoticeWidth(viewportWidth: number, notice: Locator) {
  const box = await notice.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Expected notice box");

  if (viewportWidth >= 1280) {
    expect(Math.round(box.width)).toBe(BOTTOM_NOTICE_DESKTOP_WIDTH_PX);
  } else {
    expect(box.width).toBeGreaterThan(viewportWidth - 40);
    expect(box.width).toBeLessThanOrEqual(viewportWidth - 16);
  }
}

async function assertBottomLeft(page: Page) {
  const stack = page.locator("section.compass-bottom-notice-stack");
  await expect(stack).toBeVisible();
  const stackBox = await stack.boundingBox();
  const viewport = page.viewportSize();
  expect(stackBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!stackBox || !viewport) throw new Error("Expected layout boxes");
  expect(stackBox.x).toBeLessThan(viewport.width * 0.35);
}

test.describe("bottom notice queue", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });

  test("1280px shows one notice at a time with shared width and typography", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareSession(page);
    await openWeek(page);

    await showAppUpdateNotice(page);
    const updateNotice = page.locator('[data-app-update-notice=""]');
    await expect(updateNotice).toBeVisible({ timeout: 60_000 });
    await assertSingleNotice(page);
    await assertNoticeWidth(1280, updateNotice);
    await assertBottomLeft(page);
    const updateTypography = await readMessageAndButtonStyle(updateNotice);

    await expect(
      page.locator('[data-first-event-prompt=""]'),
    ).not.toBeVisible();

    await updateNotice
      .getByRole("button", { name: "Dismiss update notice" })
      .click();
    await expect(updateNotice).not.toBeVisible({ timeout: 15_000 });

    const firstEvent = page.locator('[data-first-event-prompt=""]');
    await expect(firstEvent).toBeVisible({ timeout: 60_000 });
    await assertSingleNotice(page);
    await assertNoticeWidth(1280, firstEvent);

    const firstEventTypography = await readMessageAndButtonStyle(firstEvent);
    expect(firstEventTypography.message).toEqual(updateTypography.message);
    expect(firstEventTypography.buttonLabel).toEqual(
      updateTypography.buttonLabel,
    );
    expect(updateTypography.buttonLabel?.fontWeight).toBe("500");
  });

  test("360px shows one notice at a time at full width minus margins", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    await page.setViewportSize({ width: 360, height: 740 });
    await prepareSession(page);
    await openWeek(page);

    await showAppUpdateNotice(page);
    const updateNotice = page.locator('[data-app-update-notice=""]');
    await expect(updateNotice).toBeVisible({ timeout: 60_000 });
    await assertSingleNotice(page);
    await assertNoticeWidth(360, updateNotice);

    await updateNotice
      .getByRole("button", { name: "Dismiss update notice" })
      .click();
    const firstEvent = page.locator('[data-first-event-prompt=""]');
    await expect(firstEvent).toBeVisible({ timeout: 60_000 });
    await assertSingleNotice(page);
    await assertNoticeWidth(360, firstEvent);
  });
});
