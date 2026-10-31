import { renderHook } from "@testing-library/react";
import {
  appUpdateNoticeActions,
  useAppUpdateNoticeStore,
} from "@web/components/BottomNoticeStack/app-update-notice.store";
import { resetAppUpdateNoticeStorageForTests } from "@web/components/Sidebar/SidebarActions/app-update-notice.storage";
import { useAppUpdateAvailableNotice } from "@web/components/Sidebar/SidebarActions/useAppUpdateAvailableNotice";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("useAppUpdateAvailableNotice", () => {
  beforeEach(() => {
    resetAppUpdateNoticeStorageForTests();
    appUpdateNoticeActions.resetForTests();
  });

  afterEach(() => {
    resetAppUpdateNoticeStorageForTests();
    appUpdateNoticeActions.resetForTests();
  });

  it("queues the notice once for a pending version", () => {
    const { rerender } = renderHook(
      ({
        available,
        version,
      }: {
        available: boolean;
        version: string | null;
      }) => useAppUpdateAvailableNotice(available, version),
      { initialProps: { available: true, version: "9.9.9" } },
    );

    expect(useAppUpdateNoticeStore.getState().pendingVersion).toBe("9.9.9");

    rerender({ available: true, version: "9.9.9" });
    expect(useAppUpdateNoticeStore.getState().pendingVersion).toBe("9.9.9");
  });

  it("does not re-show after the version was handled", () => {
    renderHook(() => useAppUpdateAvailableNotice(true, "9.9.9"));
    appUpdateNoticeActions.resetForTests();

    renderHook(() => useAppUpdateAvailableNotice(true, "9.9.9"));
    expect(useAppUpdateNoticeStore.getState().pendingVersion).toBeNull();
  });
});
