import { type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Matches `AppDelegate` default content size on macOS. */
export const PARITY_VIEWPORT = { width: 1280, height: 820 } as const;

/** Keep in sync with `ParityCaptureGeometry.swift` and index.html boot track math. */
export const PARITY_SIDEBAR_WIDTH = 345;
export const PARITY_CONTENT_LEADING_INSET = 32;
export const PARITY_SIDEBAR_DIVIDER_WIDTH = 32;
export const PARITY_CONTENT_TRACK_WIDTH =
  PARITY_VIEWPORT.width -
  PARITY_CONTENT_LEADING_INSET -
  (PARITY_SIDEBAR_DIVIDER_WIDTH + PARITY_SIDEBAR_WIDTH);

const DEMO_SEED_PATH = join(
  process.cwd(),
  "apps/calendar-macos/CompassKit/Sources/CompassKit/Resources/Fixtures/demo-seed.json",
);

type DemoSeedFixture = {
  referenceNow: string;
  timeZone: string;
  calendarId: string;
  events: unknown[];
};

const demoFixture = JSON.parse(
  readFileSync(DEMO_SEED_PATH, "utf8"),
) as DemoSeedFixture;

type ParityWebOptions = {
  /** When false, leave welcome modal eligible (onboarding capture). */
  dismissOnboarding?: boolean;
};

/** Playwright-only setup for `e2e/parity/desktop-web-parity.spec.ts`; not used by the web app. */
export async function installParityWebEnvironment(
  page: Page,
  options: ParityWebOptions = {},
) {
  const dismissOnboarding = options.dismissOnboarding ?? true;
  const localStorageSeed: Record<string, string> = {
    "compass.theme": "light-beach",
    "compass.migration.demo-data-seed-v2": "done",
    "compass.localCalendarId": demoFixture.calendarId,
    "compass.view.sidebar-open": "true",
    "compass.sidebar.width": String(PARITY_SIDEBAR_WIDTH),
    // Parity captures only: macOS asserts UTC on the grid header; pin web the same for screenshots.
    "compass.timezone.default": demoFixture.timeZone,
  };
  if (dismissOnboarding) {
    localStorageSeed["compass.onboarding.has-seen-welcome"] = "true";
    localStorageSeed["compass.onboarding.first-event-done"] = "dismissed";
  }
  await page.clock.install({ time: new Date(demoFixture.referenceNow) });
  await page.addInitScript((flags) => {
    for (const [key, value] of Object.entries(flags)) {
      localStorage.setItem(key, value);
    }
  }, localStorageSeed);
}

type PrepareParityDemoWeekOptions = {
  dismissDemoBanner?: boolean;
};

/** Load demo-seed.json into IndexedDB after the app has opened compass-local. */
export async function prepareParityDemoWeek(
  page: Page,
  options: PrepareParityDemoWeekOptions = {},
) {
  const dismissDemoBanner = options.dismissDemoBanner ?? true;
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await page.locator("#timedColumns").waitFor({ timeout: 20_000 });
  await seedParityDemoEvents(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectDemoGrid(page);
  if (dismissDemoBanner) {
    const banner = page
      .getByRole("status")
      .filter({ hasText: "Sample events to help you explore" });
    const okay = banner.getByText("Okay", { exact: true });
    if (await okay.isVisible().catch(() => false)) {
      await okay.click();
      await banner.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    }
  }
  await page.locator("#mainGrid").focus();
  await page.keyboard.press("t");
  // Match macOS instant scroll-to-now during parity capture (no mid-animation PNGs).
  await page.evaluate(
    ({ referenceNowIso }) => {
      const timedGrid = document.getElementById("timedColumns");
      if (!(timedGrid instanceof HTMLElement)) return;
      const timedVisibleHours = 13;
      const scrollToNowBufferPx = 150;
      const minuteHeight = timedGrid.clientHeight / timedVisibleHours / 60;
      const now = new Date(referenceNowIso);
      const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const targetTop = Math.max(
        0,
        minutes * minuteHeight - scrollToNowBufferPx,
      );
      timedGrid.scrollTo({ top: targetTop, behavior: "instant" });
    },
    { referenceNowIso: demoFixture.referenceNow },
  );
  await page
    .getByRole("button", { name: "Lunch with Sam" })
    .waitFor({ timeout: 15_000 });
  await page
    .getByRole("button", { name: /Exercise|Morning standup/i })
    .first()
    .waitFor({ timeout: 15_000 });
}

export async function expectDemoGrid(page: Page) {
  await page.locator("#timedColumns").waitFor({ timeout: 20_000 });
  await page
    .getByRole("button", { name: /Try Compass|Morning standup/i })
    .first()
    .waitFor({ timeout: 20_000 });
}

async function seedParityDemoEvents(page: Page) {
  await page.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("compass-local");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("events", "readwrite");
        const store = tx.objectStore("events");
        store.clear();
        for (const record of records) {
          store.put(record);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, demoFixture.events);
}
