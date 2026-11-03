import { setAuthSessionAuthenticated } from "@web/auth/compass/session/auth-session.store";
import * as Track from "@web/auth/posthog/track";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { mergeHintShortcutCelebrationFromMetadata } from "@web/shortcuts/tips/hint-shortcut-celebration.storage";
import {
  hintShortcutCelebrationActions,
  resetHintShortcutCelebrationTimerForTests,
  useHintShortcutCelebrationStore,
} from "@web/shortcuts/tips/hint-shortcut-celebration.store";
import { SHORTCUT_HINTS } from "@web/shortcuts/tips/shortcut-tips.data";
import { tryCelebrateHintShortcutUse } from "@web/shortcuts/tips/try-celebrate-hint-shortcut";
import { visibleShortcutHintActions } from "@web/shortcuts/tips/visible-shortcut-hint.store";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

const KEY = "grid-scroll:pagedown";

const activeSpies: Array<{ mockRestore: () => void }> = [];

describe("tryCelebrateHintShortcutUse", () => {
  afterEach(() => {
    while (activeSpies.length > 0) {
      activeSpies.pop()?.mockRestore();
    }
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_HINT_FIRST_USED);
    resetHintShortcutCelebrationTimerForTests();
    visibleShortcutHintActions.clearSidebarHint();
    userMetadataActions.clear();
    setAuthSessionAuthenticated(false);
  });

  function armVisibleGridScrollTip() {
    visibleShortcutHintActions.setSidebarHint({
      id: "grid-scroll",
      parts: SHORTCUT_HINTS["grid-scroll"].parts,
    });
  }

  it("writes seen state before the pulse animation starts", () => {
    armVisibleGridScrollTip();
    activeSpies.push(
      spyOn(hintShortcutCelebrationActions, "pulse").mockImplementation(
        (key) => {
          expect(
            persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_HINT_FIRST_USED),
          ).toContain(key);
        },
      ),
    );

    tryCelebrateHintShortcutUse(KEY);
  });

  it("persists before pulsing and tracks only the first use in a session", () => {
    const track = spyOn(Track, "track");
    const pulse = spyOn(hintShortcutCelebrationActions, "pulse");
    activeSpies.push(track, pulse);
    armVisibleGridScrollTip();

    tryCelebrateHintShortcutUse(KEY);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_HINT_FIRST_USED),
    ).toContain(KEY);
    expect(useHintShortcutCelebrationStore.getState().activeKey).toBe(KEY);

    tryCelebrateHintShortcutUse(KEY);

    expect(track).toHaveBeenCalledTimes(1);
    expect(pulse).toHaveBeenCalledTimes(1);
    expect(useHintShortcutCelebrationStore.getState().activeKey).toBe(KEY);
  });

  it("does not animate again after a new session when local storage retained", () => {
    armVisibleGridScrollTip();
    tryCelebrateHintShortcutUse(KEY);

    resetHintShortcutCelebrationTimerForTests();
    armVisibleGridScrollTip();

    tryCelebrateHintShortcutUse(KEY);
    expect(useHintShortcutCelebrationStore.getState().activeKey).toBeNull();
  });

  it("does not animate on a fresh device when the account already marked the shortcut seen", () => {
    setAuthSessionAuthenticated(true);
    userMetadataActions.set({ shortcuts: { hintFirstUsed: [KEY] } });
    mergeHintShortcutCelebrationFromMetadata({
      shortcuts: { hintFirstUsed: [KEY] },
    });

    armVisibleGridScrollTip();
    const track = spyOn(Track, "track");
    activeSpies.push(track);

    tryCelebrateHintShortcutUse(KEY);

    expect(
      track.mock.calls.some(([name]) => name === "hint_shortcut_first_used"),
    ).toBe(false);
    expect(useHintShortcutCelebrationStore.getState().activeKey).toBeNull();
  });
});
