import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import dayjs from "@core/util/date/dayjs";
import { DATA_TIMED_GRID_ROW } from "@web/common/constants/web.constants";
import {
  TIMED_HOUR_SLOT_HEIGHT_CLASS,
  TIMED_VISIBLE_HOURS,
} from "@web/grid/grid.constants";
import { ALL_DAY_COLUMN_TINT_PERCENT } from "@web/grid/utils/allDayColumnTint.util";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";
import { describe, expect, it, setSystemTime } from "bun:test";
import "@testing-library/jest-dom";
import { TimedGrid } from "./TimedGrid";

const today = dayjs("2026-04-24T12:00:00.000Z");
const denverToday = dayjs.tz("2026-04-24T12:00", "America/Denver");

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

  it("uses the longest civil day in the visible week for hour-slot count", () => {
    act(() => setPinnedTimeZone("America/Denver"));
    const fallBackSunday = dayjs.tz("2026-11-01T12:00", "America/Denver");
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = fallBackSunday.add(index, "day");
      return { date, key: date.format("YYYY-MM-DD") };
    });
    const today = dayjs.tz("2026-10-15T12:00", "America/Denver");

    render(
      <TimedGrid
        eventsLayer={null}
        timedColumnsRef={() => {}}
        timedGridRef={() => {}}
        today={today}
        visibleDates={weekDays}
      />,
    );

    const grid = screen.getByRole("region", { name: "Timed events grid" });
    expect(grid.style.getPropertyValue("--calendar-day-hour-slots")).toBe("25");
  });

  it("shows the now-time label in the gutter on day view when today is visible", () => {
    act(() => setPinnedTimeZone("America/Denver"));
    setSystemTime(new Date("2026-04-24T13:37:00.000Z"));

    render(
      <TimedGrid
        eventsLayer={null}
        timedColumnsRef={() => {}}
        timedGridRef={() => {}}
        today={denverToday}
        visibleDates={[{ date: denverToday, key: "today" }]}
      />,
    );

    expect(screen.getByTestId("now-time-label")).toHaveTextContent("7:37 AM");
  });

  it("shows the week now pill left of today's column when today is mid-week", () => {
    act(() => setPinnedTimeZone("America/Denver"));
    setSystemTime(new Date("2026-04-24T13:37:00.000Z"));
    const weekStart = dayjs.tz("2026-04-20T12:00", "America/Denver");
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = weekStart.add(index, "day");
      return { date, key: date.format("YYYY-MM-DD") };
    });

    render(
      <TimedGrid
        eventsLayer={null}
        timedColumnsRef={() => {}}
        timedGridRef={() => {}}
        today={denverToday}
        visibleDates={weekDays}
      />,
    );

    const label = screen.getByTestId("now-time-label");
    expect(label).toHaveTextContent("7:37");
    expect(label.className).toContain("-translate-x-full");
  });

  it("shows the week now label in the gutter when today is the first column", () => {
    act(() => setPinnedTimeZone("America/Denver"));
    setSystemTime(new Date("2026-04-20T13:37:00.000Z"));
    const monday = dayjs.tz("2026-04-20T12:00", "America/Denver");
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = monday.add(index, "day");
      return { date, key: date.format("YYYY-MM-DD") };
    });

    render(
      <TimedGrid
        eventsLayer={null}
        timedColumnsRef={() => {}}
        timedGridRef={() => {}}
        today={monday}
        visibleDates={weekDays}
      />,
    );

    const label = screen.getByTestId("now-time-label");
    expect(label.className).not.toContain("-translate-x-full");
  });

  it("sets grid geometry CSS variables once on the scroll region", () => {
    render(
      <TimedGrid
        eventsLayer={null}
        timedColumnsRef={() => {}}
        timedGridRef={() => {}}
        today={today}
        visibleDates={[{ date: today, key: "today" }]}
      />,
    );

    const grid = screen.getByRole("region", { name: "Timed events grid" });
    expect(grid.style.getPropertyValue("--calendar-column-count")).toBe("1");
    expect(grid.style.getPropertyValue("--calendar-visible-hours")).toBe(
      String(TIMED_VISIBLE_HOURS),
    );
    expect(grid.style.getPropertyValue("--calendar-day-hour-slots")).toBe("24");
  });
});
