import * as Track from "@web/auth/posthog/track";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { pulsePaletteTaughtShortcut } from "@web/components/CommandPalette/palette-shortcut-telemetry";
import {
  resetPointerHintPersistenceForTests,
  writePointerHintDismissedPermanently,
} from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { usePointerHintStore } from "@web/shortcuts/keyboard-only/pointer-hint.store";
import {
  readTipsMuted,
  resetShortcutTipsMutedStoreForTests,
  setTipsMuted,
} from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

describe("pulsePaletteTaughtShortcut", () => {
  beforeEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_TIPS_MUTED);
    resetShortcutTipsMutedStoreForTests();
    usePointerHintStore.setState({
      latestAttempt: null,
      pulse: 0,
    });
  });

  afterEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_TIPS_MUTED);
    resetShortcutTipsMutedStoreForTests();
    resetPointerHintPersistenceForTests();
  });

  it("pulses the pointer hint for a row with a shortcut", () => {
    const track = spyOn(Track, "track");
    pulsePaletteTaughtShortcut("c");
    expect(usePointerHintStore.getState().latestAttempt).toEqual({
      shortcutKey: "c",
      source: "palette",
    });
    expect(usePointerHintStore.getState().pulse).toBe(1);
    expect(track).toHaveBeenCalledWith("pointer_hint_shown", {
      shortcut_id: "create-timed",
      source: "palette",
    });
    track.mockRestore();
  });

  it("does not pulse for a row without a shortcut", () => {
    pulsePaletteTaughtShortcut(undefined);
    expect(usePointerHintStore.getState().latestAttempt).toBeNull();
    expect(usePointerHintStore.getState().pulse).toBe(0);
  });

  it("skips the palette hint when keyboard tips are permanently dismissed", () => {
    writePointerHintDismissedPermanently();
    pulsePaletteTaughtShortcut("c");
    expect(usePointerHintStore.getState().pulse).toBe(0);
  });

  it("skips the palette hint when shortcut tips are muted", () => {
    setTipsMuted(true);
    expect(readTipsMuted()).toBe(true);
    pulsePaletteTaughtShortcut("c");
    expect(usePointerHintStore.getState().pulse).toBe(0);
    expect(usePointerHintStore.getState().latestAttempt).toBeNull();
  });
});
