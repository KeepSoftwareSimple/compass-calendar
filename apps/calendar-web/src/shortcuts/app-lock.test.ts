import { act, renderHook } from "@testing-library/react";
import {
  clearAppLockReasons,
  getAppLockReasons,
  hasAppLockReason,
  setAppLockReason,
  useAppLockReason,
} from "@web/shortcuts/app-lock";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  clearAppLockReasons();
});

describe("app-lock", () => {
  it("sets and clears dataset.appLocked from named reasons", () => {
    setAppLockReason("a", true);
    expect(document.body.dataset.appLocked).toBe("true");

    setAppLockReason("b", true);
    setAppLockReason("a", false);
    expect(document.body.dataset.appLocked).toBe("true");

    setAppLockReason("b", false);
    expect(document.body.dataset.appLocked).toBeUndefined();
  });

  it("useAppLockReason syncs with locked and cleans up on unmount", () => {
    const { rerender, unmount } = renderHook(
      ({ locked }) => useAppLockReason("hook", locked),
      { initialProps: { locked: true } },
    );

    expect(document.body.dataset.appLocked).toBe("true");

    act(() => {
      rerender({ locked: false });
    });
    expect(document.body.dataset.appLocked).toBeUndefined();

    act(() => {
      rerender({ locked: true });
    });
    expect(document.body.dataset.appLocked).toBe("true");

    unmount();
    expect(document.body.dataset.appLocked).toBeUndefined();
  });

  it("reports whether a named reason is active", () => {
    setAppLockReason("billingGate", true);
    expect(hasAppLockReason("billingGate")).toBe(true);
    expect(hasAppLockReason("settingsModal")).toBe(false);

    setAppLockReason("billingGate", false);
    expect(hasAppLockReason("billingGate")).toBe(false);
  });

  it("lists active reasons sorted for stable telemetry keys", () => {
    setAppLockReason("settingsModal", true);
    setAppLockReason("billingGate", true);
    expect(getAppLockReasons()).toEqual(["billingGate", "settingsModal"]);

    clearAppLockReasons();
    expect(getAppLockReasons()).toEqual([]);
  });
});
