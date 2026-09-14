import { expect, test } from "@playwright/test";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

test.use({
  userAgent: IPHONE_UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: { cookies: [], origins: [] },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: { mobile: true },
    });
  });
});

test("phone users can skip the game, copy the desktop link, and join the waitlist", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // The game intro is the mobile landing page; the skip link goes straight
  // to the desktop handoff.
  await expect(
    page.getByRole("heading", { name: "Time Block Party" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip to desktop link" }).click();

  await expect(
    page.getByRole("heading", { name: "Open Compass on a computer" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Copy link for desktop" }).click();

  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  await expect(page.locator("[data-pointer-hint]")).toHaveCount(0);

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Join mobile waitlist" }).click();
  const popup = await popupPromise;
  expect(popup.url()).toContain("tylerdane.kit.com/compass-mobile");
  await expect(page.locator("[data-pointer-hint]")).toHaveCount(0);
  await popup.close();
});

test("phone users can drag the first event into place and score", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText("Level 1 of 3")).toBeVisible();

  // Level 1's first piece is Standup at 9:00 AM, the top hour of the
  // 9am-5pm grid: drag the tray card onto that slot's vertical center.
  const card = page.locator("[data-game-piece]");
  const cardBox = await card.boundingBox();
  const board = await page.locator("[data-game-board]").boundingBox();
  if (!cardBox || !board) throw new Error("game surfaces not laid out");

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    board.x + board.width / 2,
    board.y + board.height / 16,
    {
      steps: 8,
    },
  );
  await expect(page.locator("[data-game-slot-hover]")).toBeVisible();
  await page.mouse.up();

  // 100 base + 50 speed bonus.
  await expect(page.locator("[data-game-score]")).toHaveText("150");
  await expect(page.locator("[data-game-block='standup']")).toBeVisible();
});

test("phone users can tap the first event and tap its slot", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText("Level 1 of 3")).toBeVisible();

  const card = page.locator("[data-game-piece]");
  const cardBox = await card.boundingBox();
  const board = await page.locator("[data-game-board]").boundingBox();
  if (!cardBox || !board) throw new Error("game surfaces not laid out");

  await page.touchscreen.tap(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2,
  );
  await expect(
    page.getByText("Now tap where it goes on the calendar"),
  ).toBeVisible();

  await page.touchscreen.tap(
    board.x + board.width / 2,
    board.y + board.height / 16,
  );

  await expect(page.locator("[data-game-score]")).toHaveText("150");
  await expect(page.locator("[data-game-block='standup']")).toBeVisible();
});
