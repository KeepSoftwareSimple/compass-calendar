import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { useNoticeActionShortcut } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const wrapper = ({ children }: { children: ReactNode }) => (
  <HotkeysProvider>{children}</HotkeysProvider>
);

describe("useNoticeActionShortcut", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    clearAppLockReasons();
    eventJumpActions.reset();
    document.body.removeAttribute("data-app-locked");
  });

  afterEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
  });

  it("runs the action on the bound key", () => {
    const onClick = mock();
    renderHook(() => useNoticeActionShortcut("S", onClick), { wrapper });

    pressKey("S");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no key is bound or the binding is disabled", () => {
    const onClick = mock();
    renderHook(() => useNoticeActionShortcut(undefined, onClick), { wrapper });
    pressKey("1");
    pressKey("S");
    expect(onClick).not.toHaveBeenCalled();

    renderHook(
      () => useNoticeActionShortcut("S", onClick, { enabled: false }),
      {
        wrapper,
      },
    );
    pressKey("S");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("yields while app-locked or event jump is active", () => {
    const onClick = mock();
    renderHook(() => useNoticeActionShortcut("G", onClick), { wrapper });

    setAppLockReason("commandPalette", true);
    pressKey("G");
    expect(onClick).not.toHaveBeenCalled();
    clearAppLockReasons();

    eventJumpActions.setActive(true);
    pressKey("G");
    expect(onClick).not.toHaveBeenCalled();
  });
});
