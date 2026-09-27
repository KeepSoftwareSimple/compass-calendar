import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
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

  it("shows after an anonymous calendar write", () => {
    maybeShowAnonymousSaveToast();

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_SEEN_ANONYMOUS_SAVE_TOAST),
    ).toBe("true");
  });

  it("does not interrupt an open sign-up flow", () => {
    window.history.replaceState({}, "", "/week?auth=signup");

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

  it("shows an S keycap and signs up when S is pressed", () => {
    render(
      <HotkeysProvider>
        <AnonymousSaveToast toastId="anonymous-save-toast" />
      </HotkeysProvider>,
    );

    expect(
      within(screen.getByRole("button", { name: "Sign up" })).getByText("S"),
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
