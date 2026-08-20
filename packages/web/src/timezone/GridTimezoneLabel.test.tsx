import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import * as browserTimezone from "@web/timezone/browser-timezone";
import {
  getEffectiveTimeZone,
  resetEffectiveTimeZoneStoreForTests,
  setEffectiveTimeZoneForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { GridTimezoneLabel } from "@web/timezone/GridTimezoneLabel";
import {
  resetTimeTravelStoreForTests,
  setTimeTravelZone,
} from "@web/timezone/time-travel.store";
import {
  selectTimezoneDialogOpen,
  selectTimezoneDialogPurpose,
  timezoneDialogActions,
  useTimezoneDialogStore,
} from "@web/timezone/timezone-dialog.store";
import { describe, expect, it, spyOn } from "bun:test";

describe("GridTimezoneLabel", () => {
  it("is a focusable button named with the effective zone abbreviation", async () => {
    const user = userEvent.setup();
    act(() => {
      setEffectiveTimeZoneForTests("America/Denver");
    });

    render(
      <div>
        <button type="button">Before</button>
        <GridTimezoneLabel />
      </div>,
    );

    const abbreviation = formatTimeZoneAbbreviation("America/Denver");
    const label = screen.getByRole("button", {
      name: `Calendar timezone: ${abbreviation}`,
    });
    expect(label).toHaveTextContent(abbreviation);

    await user.tab();
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
    await user.tab();
    expect(label).toHaveFocus();
  });

  it("updates the label when the effective timezone changes", () => {
    act(() => {
      setEffectiveTimeZoneForTests("UTC");
    });

    render(<GridTimezoneLabel />);
    expect(
      screen.getByRole("button", { name: "Calendar timezone: UTC" }),
    ).toBeInTheDocument();

    act(() => {
      setEffectiveTimeZoneForTests("Asia/Kolkata");
    });

    expect(
      screen.getByRole("button", { name: "Calendar timezone: GMT+5:30" }),
    ).toHaveTextContent("GMT+5:30");
  });

  it("opens the timezone picker", async () => {
    const user = userEvent.setup();
    render(<GridTimezoneLabel />);

    await user.click(
      screen.getByRole("button", { name: /Calendar timezone:/ }),
    );

    expect(selectTimezoneDialogOpen(useTimezoneDialogStore.getState())).toBe(
      true,
    );
    expect(selectTimezoneDialogPurpose(useTimezoneDialogStore.getState())).toBe(
      "time-travel",
    );
    act(() => {
      timezoneDialogActions.close();
    });
  });

  it("keeps a pinned zone across the browser poll", () => {
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = spyOn(globalThis, "setInterval").mockImplementation(
      ((callback: TimerHandler) => {
        if (typeof callback === "function") {
          intervalCallbacks.push(() => callback());
        }
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
    );
    const clearIntervalSpy = spyOn(
      globalThis,
      "clearInterval",
    ).mockImplementation(() => {});

    try {
      act(() => {
        setEffectiveTimeZoneForTests("Pacific/Kiritimati");
      });

      render(<GridTimezoneLabel />);
      act(() => {
        for (const callback of intervalCallbacks) {
          callback();
        }
      });

      expect(getEffectiveTimeZone()).toBe("Pacific/Kiritimati");
      expect(
        screen.getByRole("button", {
          name: `Calendar timezone: ${formatTimeZoneAbbreviation("Pacific/Kiritimati")}`,
        }),
      ).toBeInTheDocument();
    } finally {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it("rereads the browser timezone on the poll interval in Auto mode", () => {
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = spyOn(globalThis, "setInterval").mockImplementation(
      ((callback: TimerHandler) => {
        if (typeof callback === "function") {
          intervalCallbacks.push(() => callback());
        }
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
    );
    const clearIntervalSpy = spyOn(
      globalThis,
      "clearInterval",
    ).mockImplementation(() => {});

    act(() => {
      resetEffectiveTimeZoneStoreForTests();
      setPinnedTimeZone(null);
    });
    expect(getEffectiveTimeZone()).not.toBe("Pacific/Kiritimati");

    const browserSpy = spyOn(
      browserTimezone,
      "getBrowserTimeZone",
    ).mockReturnValue("Pacific/Kiritimati");

    try {
      render(<GridTimezoneLabel />);
      act(() => {
        for (const callback of intervalCallbacks) {
          callback();
        }
      });

      expect(getEffectiveTimeZone()).toBe("Pacific/Kiritimati");
      expect(
        screen.getByRole("button", {
          name: `Calendar timezone: ${formatTimeZoneAbbreviation("Pacific/Kiritimati")}`,
        }),
      ).toBeInTheDocument();
    } finally {
      browserSpy.mockRestore();
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it("shows both abbreviations and a remove control while time traveling", async () => {
    const user = userEvent.setup();
    act(() => {
      setEffectiveTimeZoneForTests("America/New_York");
      setTimeTravelZone("America/Denver");
    });

    render(<GridTimezoneLabel />);

    expect(
      screen.getByRole("group", { name: "Time travel timezones" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Time travel timezone: ${formatTimeZoneAbbreviation("America/Denver")}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Calendar timezone: ${formatTimeZoneAbbreviation("America/New_York")}`,
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Remove time travel timezone" }),
    );

    expect(
      screen.queryByRole("group", { name: "Time travel timezones" }),
    ).not.toBeInTheDocument();
    act(() => {
      resetTimeTravelStoreForTests();
    });
  });
});
