import { act, renderHook } from "@testing-library/react";
import { createTestNotificationPort } from "@web/__tests__/helpers/web-test-seams";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  getNotificationPort,
  registerNotificationPort,
} from "@web/notifications/notification.port";
import {
  areNotificationsEffectivelyOn,
  isNotificationsPrefEnabled,
  notificationActions,
  useNotificationsEffectivelyOn,
} from "@web/notifications/notification.state";
import { beforeEach, describe, expect, it } from "bun:test";

const installPort = (
  options?: Parameters<typeof createTestNotificationPort>[0],
) => {
  const seam = createTestNotificationPort(options);
  registerNotificationPort(seam.port);
  return seam;
};

describe("notificationActions.enable", () => {
  beforeEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
  });

  it("opts in and persists once the browser grants permission", async () => {
    const seam = installPort({ respondWith: "granted" });

    await notificationActions.enable("palette");

    expect(seam.mocks.requestPermission).toHaveBeenCalled();
    expect(areNotificationsEffectivelyOn()).toBe(true);
    expect(persistentBrowserStore.get(STORAGE_KEYS.NOTIFICATIONS_ENABLED)).toBe(
      "true",
    );
  });

  it("stays off, and writes nothing, when permission is denied", async () => {
    installPort({ respondWith: "denied" });

    await notificationActions.enable("palette");

    expect(areNotificationsEffectivelyOn()).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.NOTIFICATIONS_ENABLED),
    ).toBeNull();
  });

  it("stays off when the prompt is dismissed without a choice", async () => {
    installPort({ respondWith: "default" });

    await notificationActions.enable("palette");

    expect(areNotificationsEffectivelyOn()).toBe(false);
  });

  it("never prompts on a browser without the API", async () => {
    const seam = installPort({ supported: false });

    await notificationActions.enable("palette");

    expect(seam.mocks.requestPermission).not.toHaveBeenCalled();
    expect(areNotificationsEffectivelyOn()).toBe(false);
  });
});

describe("notificationActions.disable", () => {
  it("clears the pref while leaving the browser grant alone", async () => {
    installPort({ respondWith: "granted" });
    await notificationActions.enable("palette");

    notificationActions.disable("palette");

    expect(areNotificationsEffectivelyOn()).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.NOTIFICATIONS_ENABLED),
    ).toBeNull();
    expect(getNotificationPort().getPermission()).toBe("granted");
  });
});

describe("permission revoked outside the app", () => {
  it("reads as off once the grant is withdrawn", async () => {
    const seam = installPort({ respondWith: "granted" });
    await notificationActions.enable("palette");
    expect(areNotificationsEffectivelyOn()).toBe(true);

    seam.setPermission("denied");

    // The pref survives, but nothing fires and the UI offers to enable again.
    expect(areNotificationsEffectivelyOn()).toBe(false);
    expect(isNotificationsPrefEnabled()).toBe(true);
  });
});

describe("cross-tab preference", () => {
  it("picks up an opt-out made in another tab", async () => {
    installPort({ respondWith: "granted" });
    await notificationActions.enable("palette");
    expect(areNotificationsEffectivelyOn()).toBe(true);

    persistentBrowserStore.remove(STORAGE_KEYS.NOTIFICATIONS_ENABLED);

    expect(areNotificationsEffectivelyOn()).toBe(false);
  });

  it("picks up an opt-in made in another tab", () => {
    installPort({ permission: "granted" });
    expect(areNotificationsEffectivelyOn()).toBe(false);

    persistentBrowserStore.set(STORAGE_KEYS.NOTIFICATIONS_ENABLED, "true");

    expect(areNotificationsEffectivelyOn()).toBe(true);
  });
});

describe("effective state on load", () => {
  it("re-reads a stored opt-in and the live permission on load", () => {
    persistentBrowserStore.set(STORAGE_KEYS.NOTIFICATIONS_ENABLED, "true");

    installPort({ permission: "granted" });

    expect(areNotificationsEffectivelyOn()).toBe(true);
  });

  it("ignores a stored opt-in the browser no longer backs", () => {
    persistentBrowserStore.set(STORAGE_KEYS.NOTIFICATIONS_ENABLED, "true");

    installPort({ permission: "default" });

    expect(areNotificationsEffectivelyOn()).toBe(false);
  });
});

describe("useNotificationsEffectivelyOn", () => {
  it("notifies subscribers when another tab opts in", () => {
    installPort({ permission: "granted" });
    const { result } = renderHook(() => useNotificationsEffectivelyOn());
    expect(result.current).toBe(false);

    persistentBrowserStore.set(STORAGE_KEYS.NOTIFICATIONS_ENABLED, "true");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEYS.NOTIFICATIONS_ENABLED,
        }),
      );
    });

    expect(result.current).toBe(true);
  });

  it("notifies subscribers when the browser grant is withdrawn", async () => {
    const seam = installPort({ respondWith: "granted" });
    const { result } = renderHook(() => useNotificationsEffectivelyOn());
    await act(async () => {
      await notificationActions.enable("palette");
    });
    expect(result.current).toBe(true);

    act(() => {
      seam.setPermission("denied");
    });

    expect(result.current).toBe(false);
  });
});
