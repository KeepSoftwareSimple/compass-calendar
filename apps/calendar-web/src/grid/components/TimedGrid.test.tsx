import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "@core/util/date/dayjs";
import { DATA_TIMED_GRID_ROW } from "@web/common/constants/web.constants";
import { TIMED_HOUR_SLOT_HEIGHT_CLASS } from "@web/grid/grid.constants";
import { ALL_DAY_COLUMN_TINT_PERCENT } from "@web/grid/utils/allDayColumnTint.util";
import { describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";
import { TimedGrid } from "./TimedGrid";

const today = dayjs("2026-04-24T12:00:00.000Z");

describe("TimedGrid", () => {
  it("is reachable by Tab, not just by mouse click", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <button type="button">Before</button>
        <TimedGrid
          eventsLayer={null}
          timedColumnsRef={() => {}}
          timedGridRef={() => {}}
          today={today}
          visibleDates={[{ date: today, key: "today" }]}
        />
      </div>,
    );

    const grid = screen.getByRole("region", { name: "Timed events grid" });

    await user.tab();
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();

    await user.tab();
    expect(grid).toHaveFocus();
  });

  it("applies the all-day tint CSS variable and wash on the day column", () => {
    const tint = "#0B8043";
    render(
      <TimedGrid
        eventsLayer={null}
        timedColumnsRef={() => {}}
        timedGridRef={() => {}}
        today={today}
        visibleDates={[
          {
            date: today,
            key: "today",
            allDayTintColor: tint,
            surfaceLabel: "Tinted day",
          },
        ]}
      />,
    );

    const column = screen.getByRole("columnheader", { name: "Tinted day" });
    expect(column.getAttribute("data-all-day-tint")).toBe("true");
    expect(column.style.getPropertyValue("--column-all-day-tint")).toBe(tint);
    // jsdom may normalize the hex inside color-mix to rgb(...).
    expect(column.style.backgroundColor).toContain("color-mix(in srgb,");
    expect(column.style.backgroundColor).toContain(
      `${ALL_DAY_COLUMN_TINT_PERCENT}%`,
    );
  });

  it("marks the highlighted calendar column", () => {
    render(
      <TimedGrid
        eventsLayer={null}
        highlightedColumnKey="work"
        timedColumnsRef={() => {}}
        timedGridRef={() => {}}
        today={today}
        visibleDates={[
          {
            date: today,
            key: "personal",
            surfaceLabel: "Personal column",
          },
          {
            date: today,
            key: "work",
            surfaceLabel: "Work column",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Work column" }),
    ).toHaveAttribute("data-focused-column", "true");
    expect(
      screen.getByRole("columnheader", { name: "Personal column" }),
    ).not.toHaveAttribute("data-focused-column");
  });

  it("uses the same hour-slot height for labels and timed grid rows", () => {
    render(
      <TimedGrid
        eventsLayer={null}
        timedColumnsRef={() => {}}
        timedGridRef={() => {}}
        today={today}
        visibleDates={[{ date: today, key: "today" }]}
      />,
    );

    const labelSlot = screen.getByText("1 AM").parentElement;
    const hourRow = document.querySelector(`[${DATA_TIMED_GRID_ROW}]`);

    expect(labelSlot).toHaveClass(TIMED_HOUR_SLOT_HEIGHT_CLASS);
    expect(hourRow).toHaveClass(TIMED_HOUR_SLOT_HEIGHT_CLASS);
  });
});
