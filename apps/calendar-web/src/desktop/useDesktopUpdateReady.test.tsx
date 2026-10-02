import { renderHook } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { useDesktopUpdateReady } from "@web/desktop/useDesktopUpdateReady";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("useDesktopUpdateReady", () => {
  const { port, mocks } = createTestToastPort();
  const restartToUpdate = mock();
  let deliverUpdateReady: (version: string) => void = () => {};
  const unsubscribe = mock();

  const installBridge = () => {
    window.compassDesktop = {
      version: "1",
      platform: "macos",
      openExternal: () => {},
      setAgenda: () => {},
      restartToUpdate,
      onDeepLink: () => () => {},
      onUpdateReady: (handler) => {
        deliverUpdateReady = handler;
        return unsubscribe;
      },
    };
  };

  beforeEach(() => {
    mocks.toast.mockClear();
    restartToUpdate.mockClear();
    unsubscribe.mockClear();
    registerToastPort(port);
    delete window.compassDesktop;
  });

  afterEach(() => {
    delete window.compassDesktop;
  });

  it("shows the update toast when the shell reports a staged update", () => {
    installBridge();
    renderHook(() => useDesktopUpdateReady());

    deliverUpdateReady("0.2.0");

    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("does nothing in a plain browser", () => {
    renderHook(() => useDesktopUpdateReady());

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    installBridge();
    const { unmount } = renderHook(() => useDesktopUpdateReady());

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
