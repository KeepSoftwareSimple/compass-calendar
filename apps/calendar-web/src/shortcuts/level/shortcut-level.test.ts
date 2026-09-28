import {
  computeShortcutLevel,
  SHORTCUT_LEVELS,
} from "@web/shortcuts/level/shortcut-level";
import { describe, expect, it } from "bun:test";

const REGISTRY_IDS = Array.from(
  { length: 60 },
  (_, index) => `shortcut-${index}`,
);

const usedSet = (count: number): ReadonlySet<string> =>
  new Set(REGISTRY_IDS.slice(0, count));

describe("computeShortcutLevel", () => {
  it("starts at the first level with no used shortcuts", () => {
    const level = computeShortcutLevel(new Set(), REGISTRY_IDS);

    expect(level.level).toBe(1);
    expect(level.name).toBe("Newcomer");
    expect(level.used).toBe(0);
    expect(level.total).toBe(REGISTRY_IDS.length);
    expect(level.nextName).toBe("Explorer");
    expect(level.remaining).toBe(4);
  });

  it("stays on the lower level exactly below a threshold", () => {
    const level = computeShortcutLevel(usedSet(3), REGISTRY_IDS);

    expect(level.level).toBe(1);
    expect(level.remaining).toBe(1);
  });

  it("reaches the next level exactly at its threshold", () => {
    const level = computeShortcutLevel(usedSet(4), REGISTRY_IDS);

    expect(level.level).toBe(2);
    expect(level.name).toBe("Explorer");
    expect(level.nextName).toBe("Navigator");
    expect(level.remaining).toBe(6);
  });

  it("has no next level or remaining count at the top", () => {
    const topThreshold = SHORTCUT_LEVELS[SHORTCUT_LEVELS.length - 1]?.minUsed;
    const level = computeShortcutLevel(
      usedSet(topThreshold ?? 0),
      REGISTRY_IDS,
    );

    expect(level.level).toBe(SHORTCUT_LEVELS.length);
    expect(level.nextName).toBeUndefined();
    expect(level.remaining).toBeUndefined();
  });

  it("ignores used ids the registry no longer knows", () => {
    const level = computeShortcutLevel(
      new Set(["stale-id-1", "stale-id-2"]),
      REGISTRY_IDS,
    );

    expect(level.used).toBe(0);
    expect(level.level).toBe(1);
  });

  it("reports total as the registry's own length", () => {
    const level = computeShortcutLevel(new Set(), REGISTRY_IDS.slice(0, 10));

    expect(level.total).toBe(10);
  });
});

describe("SHORTCUT_LEVELS", () => {
  it("keeps the thresholds increasing from zero, which is what lets the lookup seed on the first level", () => {
    expect(SHORTCUT_LEVELS[0].minUsed).toBe(0);

    const thresholds = SHORTCUT_LEVELS.map((definition) => definition.minUsed);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(new Set(thresholds).size).toBe(thresholds.length);
  });

  it("numbers the levels in table order so the badge reads Lv 1 upward", () => {
    expect(SHORTCUT_LEVELS.map((definition) => definition.level)).toEqual(
      SHORTCUT_LEVELS.map((_, index) => index + 1),
    );
  });
});
