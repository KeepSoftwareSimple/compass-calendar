import { act, renderHook } from "@testing-library/react";
import * as Track from "@web/auth/posthog/track";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { useShortcutTipsCmdItems } from "@web/components/CommandPalette/hooks/useShortcutTipsCmdItems";
import { resetShortcutLevelHiddenStoreForTests } from "@web/shortcuts/level/shortcut-level-hidden.store";
import { resetShortcutTipsMutedStoreForTests } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

describe("useShortcutTipsCmdItems", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_TIPS_MUTED);
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN);
    resetShortcutTipsMutedStoreForTests();
    resetShortcutLevelHiddenStoreForTests();
  });

  it("toggles mute from the palette row label", () => {
    const { result } = renderHook(() => useShortcutTipsCmdItems());

    expect(result.current[0]?.label).toBe("Hide shortcut tips");

    const hideTips = result.current[0]!.onClick as () => void;
    act(() => hideTips());

    expect(persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_TIPS_MUTED)).toBe(
      "true",
    );

    const { result: afterMute } = renderHook(() => useShortcutTipsCmdItems());
    expect(afterMute.current[0]?.label).toBe("Show shortcut tips");

    const showTips = afterMute.current[0]!.onClick as () => void;
    act(() => showTips());
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_TIPS_MUTED),
    ).toBeNull();
  });

  it("toggles the shortcut level badge and tracks the change", () => {
    const track = spyOn(Track, "track");
    const { result } = renderHook(() => useShortcutTipsCmdItems());

    expect(result.current[1]?.label).toBe("Hide shortcut level");

    const hideLevel = result.current[1]!.onClick as () => void;
    act(() => hideLevel());

    expect(persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN)).toBe(
      "true",
    );
    expect(track).toHaveBeenCalledWith("shortcut_level_badge_toggled", {
      hidden: true,
    });

    const { result: afterHide } = renderHook(() => useShortcutTipsCmdItems());
    expect(afterHide.current[1]?.label).toBe("Show shortcut level");

    const showLevel = afterHide.current[1]!.onClick as () => void;
    act(() => showLevel());
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN),
    ).toBeNull();
    expect(track).toHaveBeenCalledWith("shortcut_level_badge_toggled", {
      hidden: false,
    });
    track.mockRestore();
  });
});
