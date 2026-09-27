import { cleanup, render, screen } from "@testing-library/react";
import dayjs from "@core/util/date/dayjs";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";
import { QuickTimeSlots } from "@web/shortcuts/quick-time/QuickTimeSlots";
import { type QuickTimeSlot } from "@web/shortcuts/quick-time/quick-time.util";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, describe, expect, it } from "bun:test";

const DAY = dayjs("2026-08-05T00:00:00");

const visibleDates: GridVisibleDate[] = [
  { date: DAY, key: "2026-08-05" },
  { date: DAY.add(1, "day"), key: "2026-08-06" },
];

const measurements = {
  colWidths: [140, 140],
  hourHeight: 60,
} as unknown as GridMeasurements;

const slots: QuickTimeSlot[] = [
  {
    start: DAY.hour(17).format(),
    end: DAY.hour(18).format(),
    sequence: "1700",
  },
];

const renderSlots = (props?: { slots?: QuickTimeSlot[] }) =>
  render(
    <QuickTimeSlots
      measurements={measurements}
      slots={props?.slots ?? slots}
      visibleDates={visibleDates}
    />,
  );

describe("QuickTimeSlots", () => {
  afterEach(() => {
    cleanup();
    eventJumpActions.reset();
  });

  it("stays hidden until event jump reveals the open slots", () => {
    renderSlots();

    expect(screen.queryByText("1700")).toBeNull();
  });

  it("advertises each open slot's sequence once jump mode is on", () => {
    eventJumpActions.setActive(true);
    renderSlots();

    const slot = screen.getByText("1700").closest("[data-quick-time-slot]");
    expect(slot?.getAttribute("data-quick-time-slot")).toBe("1700");
  });

  it("renders nothing when every hour is taken", () => {
    eventJumpActions.setActive(true);
    const { container } = renderSlots({ slots: [] });

    expect(container.firstChild).toBeNull();
  });

  it("is inert decoration the keyboard and pointer cannot reach", () => {
    eventJumpActions.setActive(true);
    renderSlots();

    const slot = screen.getByText("1700").closest("[data-quick-time-slot]");
    expect(slot?.getAttribute("aria-hidden")).toBe("true");
    expect(slot?.className).toContain("pointer-events-none");
  });
});
