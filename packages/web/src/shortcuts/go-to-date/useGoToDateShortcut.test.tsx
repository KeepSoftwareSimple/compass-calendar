import { act, renderHook } from "@testing-library/react";
import {
  selectIsCmdPaletteOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { clearAppLockReasons } from "@web/shortcuts/app-lock";
import { editSequenceActions } from "@web/shortcuts/edit-sequence/edit-sequence.store";
import { useGoToDateShortcut } from "@web/shortcuts/go-to-date/useGoToDateShortcut";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { resetEditSequenceArm } from "@web/shortcuts/useEditSequenceShortcut";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const pressG = (target: EventTarget = document) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "g",
      bubbles: true,
      cancelable: true,
    }),
  );
};

const isPaletteOpen = () => selectIsCmdPaletteOpen(useSettingsStore.getState());

describe("useGoToDateShortcut", () => {
  beforeEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
    resetEditSequenceArm();
    settingsActions.closeCmdPalette();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
    resetEditSequenceArm();
    settingsActions.closeCmdPalette();
    document.body.innerHTML = "";
  });

  it("opens the command palette", () => {
    renderHook(() => useGoToDateShortcut());

    act(() => {
      pressG();
    });

    expect(isPaletteOpen()).toBe(true);
  });

  it("does nothing while the e leader is armed", () => {
    renderHook(() => useGoToDateShortcut());
    editSequenceActions.arm();

    act(() => {
      pressG();
    });

    expect(isPaletteOpen()).toBe(false);
  });

  it("does nothing inside an input", () => {
    renderHook(() => useGoToDateShortcut());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      pressG(input);
    });

    expect(isPaletteOpen()).toBe(false);
  });
});
