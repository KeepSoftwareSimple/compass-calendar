import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as statusToastUtil from "@web/common/utils/toast/status-toast.util";
import {
  resetTimeTravelStoreForTests,
  setTimeTravelZone,
} from "@web/timezone/time-travel.store";
import { afterEach, describe, expect, it, mock } from "bun:test";

const showStatusToast = mock();
mockModuleForFile(
  "@web/common/utils/toast/status-toast.util",
  statusToastUtil,
  {
    showStatusToast,
  },
);

const { dismissSecondaryTimeZone, SECONDARY_TIMEZONE_HIDDEN_TOAST_ID } =
  require("@web/timezone/dismiss-secondary-timezone") as typeof import("@web/timezone/dismiss-secondary-timezone");

describe("dismissSecondaryTimeZone", () => {
  afterEach(() => {
    resetTimeTravelStoreForTests();
    showStatusToast.mockClear();
  });

  it("clears an active secondary zone and shows a toast", () => {
    setTimeTravelZone("America/Denver");

    expect(dismissSecondaryTimeZone()).toBe(true);
    expect(showStatusToast).toHaveBeenCalledWith(
      SECONDARY_TIMEZONE_HIDDEN_TOAST_ID,
      "Second timezone hidden",
    );
  });

  it("does not toast when nothing was showing", () => {
    dismissSecondaryTimeZone();

    expect(showStatusToast).not.toHaveBeenCalled();
  });
});
