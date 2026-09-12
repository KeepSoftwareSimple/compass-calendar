import { resolveModifier } from "@tanstack/react-hotkeys";
import { renderHook } from "@web/__tests__/__mocks__/mock.render";
import {
  dispatchMissingKey,
  pressKey,
} from "@web/__tests__/utils/keyboard.test.util";
import { setBillingWriteLock } from "@web/billing/billing-write-lock";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import {
  selectEditSequenceMenuVisible,
  useEditSequenceStore,
} from "@web/shortcuts/edit-sequence/edit-sequence.store";
import {
  eventJumpActions,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import {
  isEditSequenceArmed,
  resetEditSequenceArm,
  useEditSequenceShortcut,
} from "@web/shortcuts/useEditSequenceShortcut";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

/** Matches what the hook accepts for Mod on this platform. */
const MOD_INIT: KeyboardEventInit =
  resolveModifier("Mod") === "Meta" ? { metaKey: true } : { ctrlKey: true };

/** The hook's fast-path window is 600ms; wait past it for the menu. */
const PAST_ARM_WINDOW_MS = 750;
const waitPastArmWindow = () =>
  new Promise((resolve) => setTimeout(resolve, PAST_ARM_WINDOW_MS));

const isMenuVisible = () =>
  selectEditSequenceMenuVisible(useEditSequenceStore.getState());

describe("useEditSequenceShortcut", () => {
  beforeEach(() => {
    clearAppLockReasons();
    resetEditSequenceArm();
    eventJumpActions.reset();
  });

  afterEach(() => {
    clearAppLockReasons();
    resetEditSequenceArm();
    eventJumpActions.reset();
    document.body.innerHTML = "";
  });

  describe("fast path", () => {
    it("fires the mapped field for e then t", () => {
      const onSequence = mock(() => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      pressKey("e");
      pressKey("t");

      expect(onSequence).toHaveBeenCalledTimes(1);
      expect(onSequence).toHaveBeenCalledWith("title");
    });

    it("stays silent within the arm window", () => {
      const onSequence = mock(() => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      pressKey("e");

      expect(isEditSequenceArmed()).toBe(true);
      expect(isMenuVisible()).toBe(false);
    });

    it("maps each shipped follow key to its form field", () => {
      const onSequence = mock(() => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      const cases = [
        ["t", "title"],
        ["l", "location"],
        ["d", "description"],
        ["s", "start"],
        ["e", "end"],
        ["r", "recurrence"],
        ["a", "attendees"],
        ["c", "color"],
        ["g", "rsvp"],
      ] as const;

      for (const [second, field] of cases) {
        onSequence.mockClear();
        pressKey("e");
        pressKey(second);
        expect(onSequence).toHaveBeenCalledWith(field);
      }
    });

    it("preventsDefault the follow key's keyup so nav chords stay quiet", () => {
      const onSequence = mock(() => {});
      const seen = mock((_event: KeyboardEvent) => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));
      document.addEventListener("keyup", seen, true);

      pressKey("e");
      pressKey("t");

      expect(onSequence).toHaveBeenCalledWith("title");
      const tUps = seen.mock.calls
        .map(([event]) => event as KeyboardEvent)
        .filter((event) => event.key === "t");
      expect(tUps.length).toBeGreaterThan(0);
      expect(tUps.every((event) => event.defaultPrevented === true)).toBe(true);

      document.removeEventListener("keyup", seen, true);
    });

    it("does not preventDefault an unmapped second key", () => {
      const onSequence = mock(() => {});
      const seen = mock((_event: KeyboardEvent) => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));
      document.addEventListener("keydown", seen, true);

      pressKey("e");
      pressKey("j");

      expect(onSequence).not.toHaveBeenCalled();
      expect(isEditSequenceArmed()).toBe(false);
      const jEvents = seen.mock.calls
        .map(([event]) => event as KeyboardEvent)
        .filter((event) => event.key === "j");
      expect(jEvents.length).toBeGreaterThan(0);
      expect(jEvents.every((event) => event.defaultPrevented === false)).toBe(
        true,
      );

      document.removeEventListener("keydown", seen, true);
    });
  });

  describe("which-key menu", () => {
    it("opens the menu and stays armed once the window elapses", async () => {
      const onSequence = mock(() => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      pressKey("e");
      await waitPastArmWindow();

      expect(isMenuVisible()).toBe(true);
      expect(isEditSequenceArmed()).toBe(true);
      expect(onSequence).not.toHaveBeenCalled();
    });

    it("still fires the field after the menu opens", async () => {
      const onSequence = mock(() => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      pressKey("e");
      await waitPastArmWindow();
      pressKey("r");

      expect(onSequence).toHaveBeenCalledWith("recurrence");
      expect(isMenuVisible()).toBe(false);
      expect(isEditSequenceArmed()).toBe(false);
    });

    it("cancels on Escape without leaking the keyup suppression", async () => {
      const onSequence = mock(() => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      pressKey("e");
      await waitPastArmWindow();
      pressKey("Escape");

      expect(isEditSequenceArmed()).toBe(false);
      expect(isMenuVisible()).toBe(false);

      // A following `t` must reach the Today shortcut, not this sequence.
      const seen = mock((_event: KeyboardEvent) => {});
      document.addEventListener("keydown", seen, true);
      pressKey("t");
      expect(onSequence).not.toHaveBeenCalled();
      const tEvents = seen.mock.calls
        .map(([event]) => event as KeyboardEvent)
        .filter((event) => event.key === "t");
      expect(tEvents.every((event) => event.defaultPrevented === false)).toBe(
        true,
      );
      document.removeEventListener("keydown", seen, true);
    });

    it("cancels on pointerdown", () => {
      const onSequence = mock(() => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      pressKey("e");
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));

      expect(isEditSequenceArmed()).toBe(false);
    });

    it("cancels on window blur", () => {
      const onSequence = mock(() => {});
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      pressKey("e");
      window.dispatchEvent(new Event("blur"));

      expect(isEditSequenceArmed()).toBe(false);
    });
  });

  describe("arming rules", () => {
    it("stays inert while typing in an input", () => {
      const onSequence = mock(() => {});
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      renderHook(() => useEditSequenceShortcut({ onSequence }));
      pressKey("e", {}, input);
      pressKey("t", {}, input);

      expect(onSequence).not.toHaveBeenCalled();
    });

    it("arms from Mod+E even inside an input", () => {
      const onSequence = mock(() => {});
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      renderHook(() => useEditSequenceShortcut({ onSequence }));
      pressKey("e", { keyDownInit: MOD_INIT, keyUpInit: MOD_INIT }, input);
      pressKey("l", {}, input);

      expect(onSequence).toHaveBeenCalledWith("location");
    });

    it("stays inert while the app lock is held", () => {
      const onSequence = mock(() => {});
      setAppLockReason("test-lock", true);

      renderHook(() => useEditSequenceShortcut({ onSequence }));
      pressKey("e");
      pressKey("t");

      expect(onSequence).not.toHaveBeenCalled();
    });

    it("arms while event jump is on so e then t can still edit the title", () => {
      // Jump stays on after focusing a card. `e` is not a day prefix, so
      // arming (and turning jump off) is what keeps `t` on title instead of
      // Tuesday.
      const onSequence = mock(() => {});
      eventJumpActions.setActive(true);
      renderHook(() => useEditSequenceShortcut({ onSequence }));

      pressKey("e");
      expect(isEditSequenceArmed()).toBe(true);
      expect(useEventJumpStore.getState().isActive).toBe(false);

      pressKey("t");
      expect(onSequence).toHaveBeenCalledWith("title");
    });

    it("does not arm when canArm is false, so the next key passes through", () => {
      const onSequence = mock(() => {});
      const seen = mock((_event: KeyboardEvent) => {});
      renderHook(() =>
        useEditSequenceShortcut({ canArm: () => false, onSequence }),
      );
      document.addEventListener("keydown", seen, true);

      pressKey("e");
      expect(isEditSequenceArmed()).toBe(false);

      pressKey("t");
      expect(onSequence).not.toHaveBeenCalled();
      const tEvents = seen.mock.calls
        .map(([event]) => event as KeyboardEvent)
        .filter((event) => event.key === "t");
      expect(tEvents.every((event) => event.defaultPrevented === false)).toBe(
        true,
      );

      document.removeEventListener("keydown", seen, true);
    });

    it("leaves jump on when canArm is false, so a following t can still be a day jump", () => {
      const onSequence = mock(() => {});
      eventJumpActions.setActive(true);
      renderHook(() =>
        useEditSequenceShortcut({ canArm: () => false, onSequence }),
      );

      pressKey("e");
      expect(isEditSequenceArmed()).toBe(false);
      expect(useEventJumpStore.getState().isActive).toBe(true);

      pressKey("t");
      expect(onSequence).not.toHaveBeenCalled();
    });

    it("still fires under app lock when ignoreAppLock is set", () => {
      const onSequence = mock(() => {});
      setAppLockReason("test-lock", true);

      renderHook(() =>
        useEditSequenceShortcut({ ignoreAppLock: true, onSequence }),
      );
      pressKey("e");
      pressKey("t");

      expect(onSequence).toHaveBeenCalledWith("title");
    });

    it("does not arm while billing is write-locked", () => {
      const onSequence = mock(() => {});
      setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

      renderHook(() => useEditSequenceShortcut({ onSequence }));
      pressKey("e");
      pressKey("t");

      expect(isEditSequenceArmed()).toBe(false);
      expect(onSequence).not.toHaveBeenCalled();
    });

    it("dispatches from a custom field table", () => {
      const onSequence = mock((_field: string) => {});
      renderHook(() =>
        useEditSequenceShortcut({
          fieldByKey: { d: "duration" },
          onSequence,
        }),
      );

      pressKey("e");
      pressKey("d");

      expect(onSequence).toHaveBeenCalledWith("duration");
    });
  });

  it("ignores KeyboardEvents with no key instead of throwing", () => {
    const onSequence = mock(() => {});
    renderHook(() => useEditSequenceShortcut({ onSequence }));

    expect(() => {
      dispatchMissingKey("keydown");
      dispatchMissingKey("keyup");
    }).not.toThrow();

    expect(isEditSequenceArmed()).toBe(false);
    expect(onSequence).not.toHaveBeenCalled();
  });
});
