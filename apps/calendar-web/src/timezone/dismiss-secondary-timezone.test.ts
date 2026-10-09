import {
  resetTimeTravelStoreForTests,
  setTimeTravelZone,
} from "@web/timezone/time-travel.store";
import { afterEach, describe, expect, it, mock } from "bun:test";

const showStatusToast = mock();
mock.module("@web/common/utils/toast/status-toast.util", () => ({
  showStatusToast,
}));

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
