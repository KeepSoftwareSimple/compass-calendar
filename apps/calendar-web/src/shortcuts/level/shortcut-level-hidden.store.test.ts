import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  resetShortcutLevelHiddenStoreForTests,
  setLevelHidden,
  useIsLevelHidden,
} from "@web/shortcuts/level/shortcut-level-hidden.store";
import { afterEach, describe, expect, it } from "bun:test";

describe("shortcutLevelHidden", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN);
    resetShortcutLevelHiddenStoreForTests();
  });

  it("starts shown and persists hidden across remounts", () => {
    const first = renderHook(() => useIsLevelHidden());
    expect(first.result.current).toBe(false);

    act(() => setLevelHidden(true));
    expect(first.result.current).toBe(true);

    first.unmount();
    const second = renderHook(() => useIsLevelHidden());
    expect(second.result.current).toBe(true);
    expect(persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN)).toBe(
      "true",
    );
  });

  it("clears storage when the badge is shown again", () => {
    act(() => setLevelHidden(true));
    act(() => setLevelHidden(false));

    const { result } = renderHook(() => useIsLevelHidden());
    expect(result.current).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN),
    ).toBeNull();
  });
});
