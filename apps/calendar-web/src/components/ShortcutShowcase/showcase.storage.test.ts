import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  clearShowcaseProgress,
  hasShowcaseInProgress,
  markShortcutShowcaseSeen,
  markShowcaseInProgress,
  readShortcutShowcaseOutcome,
} from "@web/components/ShortcutShowcase/showcase.storage";
import { afterEach, describe, expect, it } from "bun:test";

describe("showcase progress storage", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP);
    persistentBrowserStore.remove(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE);
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_SHOWCASE_OUTCOME);
  });

  it("round-trips finished and skipped outcomes", () => {
    markShortcutShowcaseSeen("finished");
    expect(readShortcutShowcaseOutcome()).toBe("finished");

    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_SHOWCASE_OUTCOME);
    markShortcutShowcaseSeen("skipped");
    expect(readShortcutShowcaseOutcome()).toBe("skipped");
  });

  it("round-trips the in-progress marker and clears it", () => {
    expect(hasShowcaseInProgress()).toBe(false);

    markShowcaseInProgress();
    expect(hasShowcaseInProgress()).toBe(true);

    clearShowcaseProgress();
    expect(hasShowcaseInProgress()).toBe(false);
  });

  it("treats a legacy lesson step id as an unfinished attempt", () => {
    persistentBrowserStore.set(STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP, "create");
    expect(hasShowcaseInProgress()).toBe(true);
  });

  it("treats an empty stored value as no progress", () => {
    persistentBrowserStore.set(STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP, "");
    expect(hasShowcaseInProgress()).toBe(false);
  });
});
