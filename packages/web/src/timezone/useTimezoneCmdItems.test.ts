import { renderHook } from "@testing-library/react";
import { act } from "react";
import {
  resetEffectiveTimeZoneStoreForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import {
  selectTimezoneDialogOpen,
  selectTimezoneDialogPurpose,
  timezoneDialogActions,
  useTimezoneDialogStore,
} from "@web/timezone/timezone-dialog.store";
import { useTimezoneCmdItems } from "@web/timezone/useTimezoneCmdItems";
import { afterEach, describe, expect, it } from "bun:test";

describe("useTimezoneCmdItems", () => {
  afterEach(() => {
    act(() => {
      resetEffectiveTimeZoneStoreForTests();
      timezoneDialogActions.close();
    });
  });

  it("labels the command with the current zone abbreviation", () => {
    act(() => {
      setPinnedTimeZone("America/Denver");
    });

    const { result } = renderHook(() => useTimezoneCmdItems());
    expect(result.current[0]?.label).toBe(
      `Change default timezone (${formatTimeZoneAbbreviation("America/Denver")})`,
    );
  });

  it("opens the timezone picker from the command palette restore path", () => {
    const { result } = renderHook(() => useTimezoneCmdItems());
    act(() => {
      result.current[0]?.onClick?.();
    });
    expect(selectTimezoneDialogOpen(useTimezoneDialogStore.getState())).toBe(
      true,
    );
  });

  it("opens the time-travel picker from the Time travel command", () => {
    const { result } = renderHook(() => useTimezoneCmdItems());
    act(() => {
      result.current[1]?.onClick?.();
    });
    expect(selectTimezoneDialogOpen(useTimezoneDialogStore.getState())).toBe(
      true,
    );
    expect(selectTimezoneDialogPurpose(useTimezoneDialogStore.getState())).toBe(
      "time-travel",
    );
  });
});
