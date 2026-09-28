import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  ANONYMOUS_SAVE_TOAST_ACTION_LABEL,
  ANONYMOUS_SAVE_TOAST_MESSAGE,
  AnonymousSaveToast,
  maybeShowAnonymousSaveToast,
} from "@web/common/utils/toast/anonymous-save.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  initialShortcutShowcaseState,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { beforeEach, describe, expect, it } from "bun:test";

describe("maybeShowAnonymousSaveToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/week");
    mocks.toast.mockClear();
    mocks.update.mockClear();
    registerToastPort(port);
    // This store is a module-level singleton shared across the whole test
    // run; a suite that leaves the showcase active would otherwise leak in.
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
  });

  it("does not show on the first two anonymous calendar writes", () => {
    maybeShowAnonymousSaveToast();
    maybeShowAnonymousSaveToast();

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_SEEN_ANONYMOUS_SAVE_TOAST),
    ).toBeNull();
    expect(
      localStorage.getItem(STORAGE_KEYS.ANONYMOUS_CALENDAR_WRITE_COUNT),
    ).toBe("2");
  });

  it("shows on the third anonymous calendar write with trial copy", () => {
    maybeShowAnonymousSaveToast();
    maybeShowAnonymousSaveToast();
    maybeShowAnonymousSaveToast();

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_SEEN_ANONYMOUS_SAVE_TOAST),
    ).toBe("true");
    expect(
      localStorage.getItem(STORAGE_KEYS.ANONYMOUS_CALENDAR_WRITE_COUNT),
    ).toBe("3");
  });

  it("does not interrupt an open sign-up flow", () => {
    window.history.replaceState({}, "", "/week?auth=signup");

    maybeShowAnonymousSaveToast();
    maybeShowAnonymousSaveToast();
    maybeShowAnonymousSaveToast();

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_SEEN_ANONYMOUS_SAVE_TOAST),
    ).toBeNull();
  });
});

describe("AnonymousSaveToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    mocks.dismiss.mockClear();
    registerToastPort(port);
  });

  it("shows trial copy, an S keycap, and starts trial when S is pressed", () => {
    render(
      <HotkeysProvider>
        <AnonymousSaveToast toastId="anonymous-save-toast" />
      </HotkeysProvider>,
    );

    expect(screen.getByText(ANONYMOUS_SAVE_TOAST_MESSAGE)).toBeTruthy();
    expect(
      within(
        screen.getByRole("button", { name: ANONYMOUS_SAVE_TOAST_ACTION_LABEL }),
      ).getByText("S"),
    ).toBeTruthy();
    expect(screen.getByText("Press Esc to dismiss")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();

    pressKey("S");

    expect(mocks.dismiss).toHaveBeenCalledWith("anonymous-save-toast");
  });

  it("leaves digit 1 for quick-time create", () => {
    render(
      <HotkeysProvider>
        <AnonymousSaveToast toastId="anonymous-save-toast" />
      </HotkeysProvider>,
    );

    pressKey("1");

    expect(mocks.dismiss).not.toHaveBeenCalled();
  });
});
