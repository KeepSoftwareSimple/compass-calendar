import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  readShortcutUsageProfile,
  resetShortcutUsageProfileStoreForTests,
  usedShortcutIds,
  useShortcutUsageProfile,
  useUsedShortcutIds,
  writeShortcutUsageProfile,
} from "@web/shortcuts/tips/shortcut-personalization.storage";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

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

describe("useShortcutUsageProfile", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_PERSONALIZATION);
    resetShortcutUsageProfileStoreForTests();
  });

  it("re-renders after a write through writeShortcutUsageProfile", () => {
    const { result } = renderHook(() => useShortcutUsageProfile());
    expect(result.current.shortcuts["nav-today"]).toBeUndefined();

    act(() => {
      writeShortcutUsageProfile({
        version: 2,
        actions: {},
        shortcuts: { "nav-today": { invocations: 1, recentImpressions: 0 } },
      });
    });

    expect(result.current.shortcuts["nav-today"]?.invocations).toBe(1);
  });

  it("resyncs from a direct storage seed after resetShortcutUsageProfileStoreForTests", () => {
    const { result } = renderHook(() => useShortcutUsageProfile());

    persistentBrowserStore.set(
      STORAGE_KEYS.SHORTCUT_PERSONALIZATION,
      JSON.stringify({
        version: 2,
        actions: {},
        shortcuts: { "nav-next": { invocations: 2, recentImpressions: 0 } },
      }),
    );
    act(() => {
      resetShortcutUsageProfileStoreForTests();
    });

    expect(result.current.shortcuts["nav-next"]?.invocations).toBe(2);
  });

  it("leaves the reactive store untouched when a write fails", () => {
    const { result } = renderHook(() => useShortcutUsageProfile());
    const setSpy = spyOn(persistentBrowserStore, "set").mockReturnValue(false);

    const wrote = writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: { "nav-today": { invocations: 1, recentImpressions: 0 } },
    });

    expect(wrote).toBe(false);
    expect(result.current.shortcuts["nav-today"]).toBeUndefined();
    setSpy.mockRestore();
  });
});

describe("usedShortcutIds", () => {
  it("includes only ids with at least one invocation", () => {
    const ids = usedShortcutIds({
      version: 2,
      actions: {},
      shortcuts: {
        "nav-today": { invocations: 1, recentImpressions: 0 },
        "nav-next": { invocations: 0, recentImpressions: 0 },
      },
    });

    expect(ids.has("nav-today")).toBe(true);
    expect(ids.has("nav-next")).toBe(false);
  });
});

describe("useUsedShortcutIds", () => {
  it("keeps the same set when only action impressions change", () => {
    const shortcuts = {
      "nav-today": { invocations: 1, recentImpressions: 0 },
    };
    writeShortcutUsageProfile({
      version: 2,
      actions: {
        "calendar.page_jump": { invocations: 1, recentImpressions: 1 },
      },
      shortcuts,
    });

    const { result } = renderHook(() => useUsedShortcutIds());
    const first = result.current;

    act(() => {
      writeShortcutUsageProfile({
        version: 2,
        actions: {
          "calendar.page_jump": { invocations: 1, recentImpressions: 2 },
        },
        shortcuts,
      });
    });

    expect(result.current).toBe(first);
    expect(result.current.has("nav-today")).toBe(true);
  });
});
