import { HotkeyManager, resolveModifier } from "@tanstack/react-hotkeys";
import { renderHook, waitFor } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import * as Track from "@web/auth/posthog/track";
import {
  resetBillingWriteLockForTests,
  setBillingWriteLock,
} from "@web/billing/billing-write-lock";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { setAppLockReason } from "@web/shortcuts/app-lock";
import {
  useAppShortcut,
  useAppShortcutUp,
  WRITE_CREATE_SHORTCUT,
} from "@web/shortcuts/useAppShortcut";
import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

function dispatchKeyEvent(
  key: string,
  type: "keydown" | "keyup",
  options: KeyboardEventInit = {},
  target: Document | HTMLElement = document,
) {
  target.dispatchEvent(
    new KeyboardEvent(type, {
      key,
      bubbles: true,
      cancelable: true,
      composed: true,
      ...options,
    }),
  );
}

describe("useAppShortcut", () => {
  const mockHandler = mock();
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mockHandler.mockClear();
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    resetBillingWriteLockForTests();
    mocks.toast.mockClear();
    registerToastPort(port);
  });

  it("calls the handler for keydown hotkeys", async () => {
    renderHook(() => useAppShortcut("A", mockHandler));

    dispatchKeyEvent("a", "keydown");

    await waitFor(() => {
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith(expect.any(KeyboardEvent));
    });
  });

  it("calls the handler for keyup hotkeys", async () => {
    renderHook(() => useAppShortcutUp("A", mockHandler));

    dispatchKeyEvent("a", "keydown");
    dispatchKeyEvent("a", "keyup");

    await waitFor(() => {
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  it("leaves a shifted key to its own binding, so Shift+W is not week view", async () => {
    // Day columns are entered with Shift+<day letter>; the bare-letter view
    // shortcuts share those letters and must not fire alongside them.
    renderHook(() => useAppShortcutUp("W", mockHandler));

    dispatchKeyEvent("W", "keydown", { shiftKey: true });
    dispatchKeyEvent("W", "keyup", { shiftKey: true });

    await waitFor(() => {
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  it("supports modifier hotkeys", async () => {
    const modifierKey = resolveModifier("Mod");
    const isCtrl = modifierKey === "Control";

    renderHook(() => useAppShortcutUp("Mod+A", mockHandler));

    dispatchKeyEvent("a", "keydown", {
      ctrlKey: isCtrl,
      metaKey: !isCtrl,
    });
    dispatchKeyEvent("a", "keyup", {
      ctrlKey: isCtrl,
      metaKey: !isCtrl,
    });

    await waitFor(() => {
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  it("ignores input events by default for single-key shortcuts", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHook(() => useAppShortcutUp("A", mockHandler));

    dispatchKeyEvent("a", "keydown", {}, input);
    dispatchKeyEvent("a", "keyup", {}, input);

    await waitFor(() => {
      expect(mockHandler).not.toHaveBeenCalled();
    });

    document.body.removeChild(input);
  });

  it("can listen inside inputs when ignoreInputs is false", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useAppShortcutUp("A", mockHandler, {
        ignoreInputs: false,
      }),
    );

    dispatchKeyEvent("a", "keydown", {}, input);
    dispatchKeyEvent("a", "keyup", {}, input);

    await waitFor(() => {
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    document.body.removeChild(input);
  });

  it("keeps Mod shortcuts active on focused radios after re-render", async () => {
    // Omitting ignoreInputs must not clobber TanStack's Mod default
    // (ignoreInputs: false) via setOptions({ ignoreInputs: undefined }).
    const radio = document.createElement("input");
    radio.type = "radio";
    document.body.appendChild(radio);
    radio.focus();

    const modifierKey = resolveModifier("Mod");
    const isCtrl = modifierKey === "Control";

    const { rerender } = renderHook(() =>
      useAppShortcut("Mod+Enter", mockHandler),
    );

    rerender();

    dispatchKeyEvent(
      "Enter",
      "keydown",
      {
        ctrlKey: isCtrl,
        metaKey: !isCtrl,
      },
      radio,
    );

    await waitFor(() => {
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    document.body.removeChild(radio);
  });

  it("blurs the active element before handling the shortcut when requested", async () => {
    const input = document.createElement("input");
    const blurSpy = mock();
    Object.defineProperty(input, "blur", {
      configurable: true,
      value: blurSpy,
    });
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useAppShortcut("Escape", mockHandler, {
        ignoreInputs: false,
        blurOnTrigger: true,
      }),
    );

    dispatchKeyEvent("Escape", "keydown", {}, input);

    await waitFor(() => {
      expect(blurSpy).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    document.body.removeChild(input);
  });

  it("does not call the handler when the app is locked", async () => {
    document.body.dataset.appLocked = "true";

    renderHook(() => useAppShortcut("A", mockHandler));

    dispatchKeyEvent("a", "keydown");

    await waitFor(() => {
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  it("still calls the handler when locked if ignoreAppLock is true", async () => {
    document.body.dataset.appLocked = "true";

    renderHook(() => useAppShortcut("A", mockHandler, { ignoreAppLock: true }));

    dispatchKeyEvent("a", "keydown");

    await waitFor(() => {
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a contextual upgrade prompt instead of running a write shortcut", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

    renderHook(() => useAppShortcut("C", mockHandler, WRITE_CREATE_SHORTCUT));

    dispatchKeyEvent("c", "keydown");

    await waitFor(() => {
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalled();
    });
  });

  it("replaces the billing gate when a locked write shortcut fires", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });
    setAppLockReason("billingGate", true);

    renderHook(() =>
      useAppShortcut("C", mockHandler, {
        ...WRITE_CREATE_SHORTCUT,
        telemetryHintId: "create-event",
      }),
    );

    dispatchKeyEvent("c", "keydown");

    await waitFor(() => {
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalled();
    });
    setAppLockReason("billingGate", false);
  });

  it("does not prompt for a write shortcut locked by a non-billing overlay", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });
    setAppLockReason("settingsModal", true);

    renderHook(() => useAppShortcut("C", mockHandler, WRITE_CREATE_SHORTCUT));

    dispatchKeyEvent("c", "keydown");

    await waitFor(() => {
      expect(mockHandler).not.toHaveBeenCalled();
    });
    expect(mocks.toast).not.toHaveBeenCalled();
    setAppLockReason("settingsModal", false);
  });

  describe("unavailable-attempt telemetry", () => {
    const attempts = (track: { mock: { calls: unknown[][] } }) =>
      track.mock.calls.filter(
        ([name]) => name === "shortcut_unavailable_attempt",
      );

    it("records overlay_open when a non-billing overlay owns the keyboard", async () => {
      const track = spyOn(Track, "track");
      setAppLockReason("settingsModal", true);

      renderHook(() =>
        useAppShortcut("C", mockHandler, {
          ...WRITE_CREATE_SHORTCUT,
          telemetryHintId: "create-event",
        }),
      );
      dispatchKeyEvent("c", "keydown");

      await waitFor(() => {
        expect(attempts(track)).toHaveLength(1);
      });
      expect(track).toHaveBeenCalledWith(
        "shortcut_unavailable_attempt",
        expect.objectContaining({
          action_id: "calendar.create_timed_event",
          context: "settingsModal",
          invocation_method: "keyboard",
          reason_code: "overlay_open",
          shortcut_type: "create-event",
        }),
      );
      setAppLockReason("settingsModal", false);
      track.mockRestore();
    });

    it("records billing_locked while the billing gate is up", async () => {
      const track = spyOn(Track, "track");
      setBillingWriteLock({ locked: true, status: "awaiting_checkout" });
      setAppLockReason("billingGate", true);

      renderHook(() =>
        useAppShortcut("C", mockHandler, {
          ...WRITE_CREATE_SHORTCUT,
          telemetryHintId: "create-event",
        }),
      );
      dispatchKeyEvent("c", "keydown");

      await waitFor(() => {
        expect(attempts(track)).toHaveLength(1);
      });
      expect(track).toHaveBeenCalledWith(
        "shortcut_unavailable_attempt",
        expect.objectContaining({ reason_code: "billing_locked" }),
      );
      setAppLockReason("billingGate", false);
      track.mockRestore();
    });

    it("records billing_locked in look-around, where no lock is held", async () => {
      const track = spyOn(Track, "track");
      setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

      renderHook(() =>
        useAppShortcut("C", mockHandler, {
          ...WRITE_CREATE_SHORTCUT,
          telemetryHintId: "create-event",
        }),
      );
      dispatchKeyEvent("c", "keydown");

      await waitFor(() => {
        expect(attempts(track)).toHaveLength(1);
        expect(mocks.toast).toHaveBeenCalled();
      });
      expect(track).toHaveBeenCalledWith(
        "shortcut_unavailable_attempt",
        expect.objectContaining({
          context: "unknown",
          reason_code: "billing_locked",
        }),
      );
      track.mockRestore();
    });

    it("ignores practice presses while the onboarding game owns the keys", async () => {
      const track = spyOn(Track, "track");
      setAppLockReason("shortcutShowcase", true);

      renderHook(() =>
        useAppShortcut("C", mockHandler, {
          ...WRITE_CREATE_SHORTCUT,
          telemetryHintId: "create-event",
        }),
      );
      dispatchKeyEvent("c", "keydown");

      await waitFor(() => {
        expect(mockHandler).not.toHaveBeenCalled();
      });
      expect(attempts(track)).toHaveLength(0);
      setAppLockReason("shortcutShowcase", false);
      track.mockRestore();
    });
  });
});
