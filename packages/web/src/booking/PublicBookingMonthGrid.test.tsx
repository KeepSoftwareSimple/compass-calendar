import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicBookingMonthGrid } from "@web/booking/PublicBookingMonthGrid";
import {
  formatBookingMonthDayLabel,
  formatBookingMonthHeading,
  listBookingWeekdayHeadings,
} from "@web/booking/public-booking.format";
import { describe, expect, it } from "bun:test";

const timeZone = "UTC";
const monthKey = "2026-08";
const todayKey = "2026-08-15";
const availableA = "2026-08-17";
const availableB = "2026-08-20";

const slots = [
  {
    slotStart: "2026-08-10T15:00:00.000Z",
    slotEnd: "2026-08-10T15:30:00.000Z",
  },
  {
    slotStart: "2026-08-17T15:00:00.000Z",
    slotEnd: "2026-08-17T15:30:00.000Z",
  },
  {
    slotStart: "2026-08-20T15:00:00.000Z",
    slotEnd: "2026-08-20T15:30:00.000Z",
  },
];

function renderGrid(
  overrides: Partial<Parameters<typeof PublicBookingMonthGrid>[0]> = {},
) {
  const selected: string[] = [];
  const months: string[] = [];
  render(
    <PublicBookingMonthGrid
      monthKey={monthKey}
      timeZone={timeZone}
      maxHorizonDays={60}
      slots={slots}
      selectedDateKey={null}
      todayKey={todayKey}
      onMonthChange={(next) => {
        months.push(next);
      }}
      onPrefetchMonth={() => {}}
      onSelectDate={(dateKey) => {
        selected.push(dateKey);
      }}
      {...overrides}
    />,
  );
  return { selected, months };
}

describe("PublicBookingMonthGrid", () => {
  it("lets guests click a highlighted day and keeps disabled days inert", async () => {
    const user = userEvent.setup({ delay: null });
    const { selected } = renderGrid();

    expect(
      screen.getByRole("heading", {
        name: formatBookingMonthHeading(monthKey, timeZone),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous month" }),
    ).toBeDisabled();

    const seventeenth = screen.getByRole("button", {
      name: formatBookingMonthDayLabel(availableA, timeZone),
    });
    await user.click(seventeenth);
    expect(selected).toEqual([availableA]);

    expect(
      screen.queryByRole("button", {
        name: formatBookingMonthDayLabel("2026-08-10", timeZone),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: formatBookingMonthDayLabel("2026-08-16", timeZone),
      }),
    ).not.toBeInTheDocument();

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
  });

  it("marks an unavailable cell as disabled and announces no times available", () => {
    renderGrid();

    const cell = screen.getByText((_, element) => {
      const text = element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return (
        element?.getAttribute("aria-disabled") === "true" &&
        /^\d+ no times available$/.test(text) &&
        text.startsWith("16")
      );
    });
    expect(cell).toHaveAttribute("aria-disabled", "true");
    expect(cell.textContent?.replace(/\s+/g, " ").trim()).toMatch(
      /no times available$/,
    );
  });

  it("keeps a single day in the tab order and moves with arrow keys", async () => {
    const user = userEvent.setup({ delay: null });
    const { selected } = renderGrid();

    for (const weekday of listBookingWeekdayHeadings(timeZone)) {
      expect(screen.getByText(weekday.long)).not.toHaveAttribute("tabindex");
    }

    const seventeenth = screen.getByRole("button", {
      name: formatBookingMonthDayLabel(availableA, timeZone),
    });
    const twentieth = screen.getByRole("button", {
      name: formatBookingMonthDayLabel(availableB, timeZone),
    });
    expect(seventeenth.tabIndex).toBe(0);
    expect(twentieth.tabIndex).toBe(-1);

    seventeenth.focus();
    await user.keyboard("{ArrowRight}");
    expect(twentieth).toHaveFocus();
    expect(seventeenth.tabIndex).toBe(-1);
    expect(twentieth.tabIndex).toBe(0);

    await user.keyboard("{Enter}");
    expect(selected).toEqual([availableB]);
  });

  it("notifies keyboard day activation and ignores pointer clicks", async () => {
    const user = userEvent.setup({ delay: null });
    const keyboard: string[] = [];
    const { selected } = renderGrid({
      onKeyboardActivateDay: (dateKey) => {
        keyboard.push(dateKey);
      },
    });

    const seventeenth = screen.getByRole("button", {
      name: formatBookingMonthDayLabel(availableA, timeZone),
    });
    await user.click(seventeenth);
    expect(selected).toEqual([availableA]);
    expect(keyboard).toEqual([]);

    seventeenth.focus();
    await user.keyboard("{Enter}");
    expect(keyboard).toEqual([availableA]);
  });

  it("disables next when the following month is past the horizon", () => {
    renderGrid({
      monthKey: "2026-09",
      maxHorizonDays: 7,
      todayKey: "2026-08-31",
      slots: [],
    });

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("sets aria-pressed on the chosen day", () => {
    renderGrid({ selectedDateKey: availableA });

    expect(
      screen.getByRole("button", {
        name: formatBookingMonthDayLabel(availableA, timeZone),
        pressed: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: formatBookingMonthDayLabel(availableB, timeZone),
        pressed: false,
      }),
    ).toBeInTheDocument();
  });
});
