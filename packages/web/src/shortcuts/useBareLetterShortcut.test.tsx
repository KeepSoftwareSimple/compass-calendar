import { act, renderHook } from "@testing-library/react";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { useBareLetterShortcut } from "@web/shortcuts/useBareLetterShortcut";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.dispatchEvent(event);
  return event;
};

describe("useBareLetterShortcut", () => {
  beforeEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
  });

  afterEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
  });

  it("claims the key when the handler acts", () => {
    const handler = mock(() => true);
    renderHook(() => useBareLetterShortcut("q", handler));

    let event: KeyboardEvent;
    act(() => {
      event = press({ key: "q" });
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event!.defaultPrevented).toBe(true);
  });

  it("lets the key through when the handler returns false", () => {
    const handler = mock(() => false);
    renderHook(() => useBareLetterShortcut("q", handler));

    let event: KeyboardEvent;
    act(() => {
      event = press({ key: "q" });
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event!.defaultPrevented).toBe(false);
  });

  it("ignores a modified key, another letter, and an already-handled event", () => {
    const handler = mock(() => true);
    renderHook(() => useBareLetterShortcut("q", handler));

    act(() => {
      press({ key: "q", metaKey: true });
      press({ key: "q", shiftKey: true });
      press({ key: "r" });
      const handled = new KeyboardEvent("keydown", {
        key: "q",
        bubbles: true,
        cancelable: true,
      });
      handled.preventDefault();
      document.dispatchEvent(handled);
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("stands down while app-locked or event jump is active", () => {
    const handler = mock(() => true);
    renderHook(() => useBareLetterShortcut("q", handler));

    setAppLockReason("commandPalette", true);
    act(() => {
      press({ key: "q" });
    });
    expect(handler).not.toHaveBeenCalled();
    clearAppLockReasons();

    eventJumpActions.setActive(true);
    act(() => {
      press({ key: "q" });
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the latest handler without resubscribing the listener", () => {
    const first = mock(() => true);
    const second = mock(() => true);
    const { rerender } = renderHook(
      ({ handler }: { handler: () => boolean }) =>
        useBareLetterShortcut("q", handler),
      { initialProps: { handler: first } },
    );

    rerender({ handler: second });
    act(() => {
      press({ key: "q" });
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("removes its listener on unmount", () => {
    const handler = mock(() => true);
    const { unmount } = renderHook(() => useBareLetterShortcut("q", handler));

    unmount();
    act(() => {
      press({ key: "q" });
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
