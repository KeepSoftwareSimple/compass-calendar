import { HotkeyManager } from "@tanstack/react-hotkeys";
import { act, renderHook } from "@testing-library/react";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import {
  clearFloatingLayerReasons,
  setFloatingLayerReason,
} from "@web/shortcuts/floating-layer";
import { useEscapeToCloseForm } from "@web/views/Forms/hooks/useEscapeToCloseForm";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("useEscapeToCloseForm", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    clearFloatingLayerReasons();
  });

  afterEach(() => {
    clearFloatingLayerReasons();
  });

  it("closes the form on Escape when no floating layer is open", () => {
    const onClose = mock(() => {});
    renderHook(() => useEscapeToCloseForm(onClose));

    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stands down while a floating layer owns Escape", () => {
    const onClose = mock(() => {});
    setFloatingLayerReason("datePicker:test", true);
    renderHook(() => useEscapeToCloseForm(onClose));

    pressKey("Escape");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes after the floating layer clears", () => {
    const onClose = mock(() => {});
    setFloatingLayerReason("datePicker:test", true);
    renderHook(() => useEscapeToCloseForm(onClose));

    pressKey("Escape");
    expect(onClose).not.toHaveBeenCalled();

    setFloatingLayerReason("datePicker:test", false);
    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Shift+Escape without prompting", () => {
    const onClose = mock(() => {});
    const { result } = renderHook(() => useEscapeToCloseForm(onClose));

    pressKey("Escape", { keyDownInit: { shiftKey: true } });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.isConfirmOpen).toBe(false);
  });

  it("closes immediately via requestClose when there is nothing to discard", () => {
    const onClose = mock(() => {});
    const { result } = renderHook(() => useEscapeToCloseForm(onClose));

    // The Close action button's path: the same decision Escape makes, without
    // the key. A dirty edit draft prompts instead, covered end to end in
    // SidebarEventDetails.test.tsx.
    act(() => result.current.requestClose());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.isConfirmOpen).toBe(false);
  });

  it("stands Shift+Escape down while a floating layer is open", () => {
    const onClose = mock(() => {});
    setFloatingLayerReason("datePicker:test", true);
    renderHook(() => useEscapeToCloseForm(onClose));

    pressKey("Escape", { keyDownInit: { shiftKey: true } });

    expect(onClose).not.toHaveBeenCalled();
  });
});
