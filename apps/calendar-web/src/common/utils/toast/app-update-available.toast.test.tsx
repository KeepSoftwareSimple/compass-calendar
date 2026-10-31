import { showAppUpdateAvailableToast } from "@web/common/utils/toast/app-update-available.toast";
import { appUpdateNoticeActions } from "@web/components/BottomNoticeStack/app-update-notice.store";
import { beforeEach, describe, expect, it } from "bun:test";

describe("showAppUpdateAvailableToast", () => {
  beforeEach(() => {
    appUpdateNoticeActions.resetForTests();
  });

  it("queues the bottom-left update notice under a stable id", () => {
    const id = showAppUpdateAvailableToast("1.0.1");
    expect(id).toBe("app-update-1.0.1");
  });
});
