import { renderHook } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realToast from "@web/common/utils/toast/app-update-available.toast";
import { resetAppUpdateNoticeStorageForTests } from "@web/components/Sidebar/SidebarActions/app-update-notice.storage";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const showAppUpdateAvailableToast = mock();
mockModuleForFile(
  "@web/common/utils/toast/app-update-available.toast",
  realToast,
  { showAppUpdateAvailableToast },
);

const moduleUrl = new URL(
  `./useAppUpdateAvailableNotice.ts?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { useAppUpdateAvailableNotice } = (await import(
  moduleUrl.href
)) as typeof import("./useAppUpdateAvailableNotice");

describe("useAppUpdateAvailableNotice", () => {
  beforeEach(() => {
    resetAppUpdateNoticeStorageForTests();
    showAppUpdateAvailableToast.mockClear();
  });

  afterEach(() => {
    resetAppUpdateNoticeStorageForTests();
  });

  it("shows the toast once for a pending version", () => {
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

    expect(showAppUpdateAvailableToast).toHaveBeenCalledTimes(1);
    expect(showAppUpdateAvailableToast).toHaveBeenCalledWith("9.9.9");

    rerender({ available: true, version: "9.9.9" });
    expect(showAppUpdateAvailableToast).toHaveBeenCalledTimes(1);
  });

  it("does not re-show after the version was handled", () => {
    renderHook(() => useAppUpdateAvailableNotice(true, "9.9.9"));
    showAppUpdateAvailableToast.mockClear();

    renderHook(() => useAppUpdateAvailableNotice(true, "9.9.9"));
    expect(showAppUpdateAvailableToast).not.toHaveBeenCalled();
  });
});
