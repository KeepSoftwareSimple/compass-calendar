import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { useShortcutTipsCmdItems } from "@web/components/CommandPalette/hooks/useShortcutTipsCmdItems";
import { resetShortcutTipsMutedStoreForTests } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { afterEach, describe, expect, it } from "bun:test";

describe("useShortcutTipsCmdItems", () => {
  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_TIPS_MUTED);
    resetShortcutTipsMutedStoreForTests();
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
});
