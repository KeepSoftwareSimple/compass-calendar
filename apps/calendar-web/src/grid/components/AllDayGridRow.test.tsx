import { render, screen } from "@testing-library/react";
import dayjs from "@core/util/date/dayjs";
import {
  EVENT_ALLDAY_GAP,
  EVENT_ALLDAY_ROW_HEIGHT,
} from "@web/grid/grid.constants";
import { ALL_DAY_COLUMN_TINT_PERCENT } from "@web/grid/utils/allDayColumnTint.util";
import { AllDayGridRow } from "./AllDayGridRow";
import { describe, expect, it } from "bun:test";

const today = dayjs("2026-04-24");

describe("AllDayGridRow", () => {
  it("applies the all-day tint wash on columns that carry a tint color", () => {
    const tint = "#039BE5";
    render(
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={null}
        visibleDates={[
          {
            date: today,
            key: "today",
            allDayTintColor: tint,
            surfaceLabel: "Tinted all-day column",
          },
        ]}
      />,
    );

    const column = screen.getByRole("columnheader", {
      name: "Tinted all-day column",
    });
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
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={null}
        highlightedColumnKey="work"
        visibleDates={[
          {
            date: today,
            key: "personal",
            surfaceLabel: "Personal all-day column",
          },
          {
            date: today,
            key: "work",
            surfaceLabel: "Work all-day column",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Work all-day column" }),
    ).toHaveAttribute("data-focused-column", "true");
    expect(
      screen.getByRole("columnheader", { name: "Personal all-day column" }),
    ).not.toHaveAttribute("data-focused-column");
  });

  it("keeps a one-row floor so empty and pending loads do not collapse the region", () => {
    const oneRowMinHeight = `${2 * EVENT_ALLDAY_GAP + EVENT_ALLDAY_ROW_HEIGHT}px`;
    const visibleDates = [
      { date: today, key: "today", surfaceLabel: "Today all-day column" },
    ];

    const { unmount } = render(
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={<span>No events yet</span>}
        rowsCount={0}
        visibleDates={visibleDates}
      />,
    );

    expect(screen.getByRole("region", { name: "All-day events" })).toHaveStyle({
      minHeight: oneRowMinHeight,
    });
    expect(screen.getByText("No events yet")).toBeVisible();
    unmount();

    render(
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={<span>One-row events</span>}
        rowsCount={1}
        visibleDates={visibleDates}
      />,
    );

    expect(screen.getByRole("region", { name: "All-day events" })).toHaveStyle({
      minHeight: oneRowMinHeight,
    });
  });

  it("grows min-height for a real multi-row all-day count", () => {
    render(
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={<span>Stacked events</span>}
        rowsCount={3}
        visibleDates={[
          { date: today, key: "today", surfaceLabel: "Today all-day column" },
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "All-day events" })).toHaveStyle({
      minHeight: `${2 * EVENT_ALLDAY_GAP + 3 * EVENT_ALLDAY_ROW_HEIGHT}px`,
    });
    expect(screen.getByText("Stacked events")).toBeVisible();
  });
});
