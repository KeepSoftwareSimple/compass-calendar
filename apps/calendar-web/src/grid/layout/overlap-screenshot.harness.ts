import {
  tylerOct31OverlapGridEvents,
  tylerOct31OverlapGridEventsLegacy,
} from "@web/grid/layout/tyler-overlap.fixture";

const FIXTURE_KEY = "compass.overlap-screenshot.fixture";
const LEGACY_DECK_KEY = "compass.overlap-screenshot.legacy-deck";

export function readOverlapScreenshotLegacyDeck(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(LEGACY_DECK_KEY) === "1";
}

export function readOverlapScreenshotFixture():
  | "tyler"
  | "tyler-legacy"
  | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(FIXTURE_KEY);
  if (value === "tyler") return "tyler";
  if (value === "tyler-legacy") return "tyler-legacy";
  return null;
}

export function tylerOverlapGridEventsForScreenshot(): ReturnType<
  typeof tylerOct31OverlapGridEvents
> | null {
  const fixture = readOverlapScreenshotFixture();
  if (fixture === "tyler") return tylerOct31OverlapGridEvents();
  if (fixture === "tyler-legacy") return tylerOct31OverlapGridEventsLegacy();
  return null;
}
