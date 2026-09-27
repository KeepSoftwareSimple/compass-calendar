import { renderHook } from "@testing-library/react";
import { act } from "react";
import { createTestNotificationPort } from "@web/__tests__/helpers/web-test-seams";
import { registerNotificationPort } from "@web/notifications/notification.port";
import { notificationActions } from "@web/notifications/notification.state";
import { useNotificationCmdItems } from "@web/notifications/useNotificationCmdItems";
import { describe, expect, it } from "bun:test";

const installPort = (
  options?: Parameters<typeof createTestNotificationPort>[0],
) => {
  const seam = createTestNotificationPort(options);
  registerNotificationPort(seam.port);
  return seam;
};

describe("useNotificationCmdItems", () => {
  it("offers to enable while notifications are off", () => {
    installPort();

    const { result } = renderHook(() => useNotificationCmdItems());

    expect(result.current[0]?.label).toBe("Enable event notifications");
  });

  it("requests permission when the enable command runs", async () => {
    const seam = installPort({ respondWith: "granted" });
    const { result } = renderHook(() => useNotificationCmdItems());

    await act(async () => {
      result.current[0]?.onClick?.();
    });

    expect(seam.mocks.requestPermission).toHaveBeenCalled();
    expect(result.current[0]?.label).toBe("Disable event notifications");
  });

  it("turns notifications back off from the same command", async () => {
    installPort({ respondWith: "granted" });
    const { result } = renderHook(() => useNotificationCmdItems());
    await act(async () => {
      await notificationActions.enable("palette");
    });

    act(() => {
      result.current[0]?.onClick?.();
    });

    expect(result.current[0]?.label).toBe("Enable event notifications");
  });

  it("offers to enable again after the grant is revoked in the browser", async () => {
    const seam = installPort({ respondWith: "granted" });
    const { result } = renderHook(() => useNotificationCmdItems());
    await act(async () => {
      await notificationActions.enable("palette");
    });

    act(() => {
      seam.setPermission("denied");
    });

    expect(result.current[0]?.label).toBe("Enable event notifications");
  });

  it("hides the command where the browser has no Notification API", () => {
    installPort({ supported: false });

    const { result } = renderHook(() => useNotificationCmdItems());

    expect(result.current).toEqual([]);
  });
});
