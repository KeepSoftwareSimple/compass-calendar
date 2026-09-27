import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  clearShowcaseProgress,
  hasShowcaseInProgress,
  markShowcaseInProgress,
} from "@web/components/ShortcutShowcase/showcase.storage";
import { afterEach, describe, expect, it } from "bun:test";

describe("showcase progress storage", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP);
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
