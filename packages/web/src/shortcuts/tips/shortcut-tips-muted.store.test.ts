import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  resetShortcutTipsMutedStoreForTests,
  setTipsMuted,
  useIsTipsMuted,
} from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { afterEach, describe, expect, it } from "bun:test";

describe("shortcutTipsMuted", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_TIPS_MUTED);
    resetShortcutTipsMutedStoreForTests();
  });

  it("starts unmuted and persists mute across remounts", () => {
    const first = renderHook(() => useIsTipsMuted());
    expect(first.result.current).toBe(false);

    act(() => setTipsMuted(true));
    expect(first.result.current).toBe(true);

    first.unmount();
    const second = renderHook(() => useIsTipsMuted());
    expect(second.result.current).toBe(true);
    expect(persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_TIPS_MUTED)).toBe(
      "true",
    );
  });

  it("clears storage when tips are shown again", () => {
    act(() => setTipsMuted(true));
    act(() => setTipsMuted(false));

    const { result } = renderHook(() => useIsTipsMuted());
    expect(result.current).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_TIPS_MUTED),
    ).toBeNull();
  });
});
