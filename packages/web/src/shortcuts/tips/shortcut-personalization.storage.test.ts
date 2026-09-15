import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_PERSONALIZATION);
});

describe("readShortcutUsageProfile", () => {
  it("migrates a version 1 profile without losing action counts", () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.SHORTCUT_PERSONALIZATION,
      JSON.stringify({
        version: 1,
        actions: {
          "calendar.page_jump": {
            invocations: 4,
            lastInvokedAt: 1_700_000_000_000,
            lastShownAt: 1_699_000_000_000,
            recentImpressions: 2,
          },
        },
      }),
    );

    expect(readShortcutUsageProfile()).toEqual({
      version: 2,
      actions: {
        "calendar.page_jump": {
          invocations: 4,
          lastInvokedAt: 1_700_000_000_000,
          lastShownAt: 1_699_000_000_000,
          recentImpressions: 2,
        },
      },
      shortcuts: {},
    });
  });

  it("keeps unknown shortcut ids on a version 2 profile", () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.SHORTCUT_PERSONALIZATION,
      JSON.stringify({
        version: 2,
        actions: {},
        shortcuts: {
          "nav-custom-future": {
            invocations: 3,
            lastInvokedAt: 42,
            recentImpressions: 0,
          },
        },
      }),
    );

    expect(readShortcutUsageProfile().shortcuts["nav-custom-future"]).toEqual({
      invocations: 3,
      lastInvokedAt: 42,
      recentImpressions: 0,
    });
  });
});
