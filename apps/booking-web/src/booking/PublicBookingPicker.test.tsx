import { PublicBookingPicker } from "@booking-web/booking/PublicBookingPicker";
import {
  formatBookingMonthDayLabel,
  formatBookingSlotTime,
} from "@booking-web/booking/public-booking.format";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

const timeZone = "UTC";
const monthKey = "2026-09";
const selectedDateKey = "2026-09-17";
const firstSlot = "2026-09-17T15:00:00.000Z";
const secondSlot = "2026-09-17T16:00:00.000Z";

const slots = [
  { slotStart: firstSlot, slotEnd: "2026-09-17T15:30:00.000Z" },
  { slotStart: secondSlot, slotEnd: "2026-09-17T16:30:00.000Z" },
];

function renderPicker() {
  render(
    <PublicBookingPicker
      monthKey={monthKey}
      timeZone={timeZone}
      maxHorizonDays={60}
      slots={slots}
      slotsPending={false}
      slotsError={false}
      slotsFetching={false}
      selectedDateKey={selectedDateKey}
      selectedSlotStart={null}
      onMonthChange={() => {}}
      onPrefetchMonth={() => {}}
      onSelectDate={() => {}}
      onSelectSlot={() => {}}
      onJumpToNextAvailable={() => {}}
      onRetrySlots={() => {}}
    />,
  );
}

describe("PublicBookingPicker", () => {
  beforeEach(() => {
    setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
  });

  afterEach(() => {
    setSystemTime();
  });

  it("scrolls the times list inside the pane instead of growing the page", () => {
    renderPicker();

    const first = screen.getByRole("button", {
      name: formatBookingSlotTime(firstSlot, timeZone),
    });
    const pane = first.closest("div");
    expect(pane?.className).toContain("sm:overflow-y-auto");
    expect(pane?.className).not.toContain("sm:max-h-96");
  });

  it("moves focus to the first slot after keyboard day activation", async () => {
    const user = userEvent.setup({ delay: null });
    renderPicker();

    const day = screen.getByRole("button", {
      name: formatBookingMonthDayLabel(selectedDateKey, timeZone),
    });
    const firstSlotButton = screen.getByRole("button", {
      name: formatBookingSlotTime(firstSlot, timeZone),
    });

    day.focus();
    await user.keyboard("{Enter}");
    expect(firstSlotButton).toHaveFocus();
  });

  it("does not move focus to a slot after a pointer day click", async () => {
    const user = userEvent.setup({ delay: null });
    renderPicker();

    const day = screen.getByRole("button", {
      name: formatBookingMonthDayLabel(selectedDateKey, timeZone),
    });
    await user.click(day);
    expect(day).toHaveFocus();
  });

  describe("phone viewport", () => {
    const originalMatchMedia = window.matchMedia;
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    let scrolledInto: Element[] = [];

    const stubViewport = (narrow: boolean) => {
      window.matchMedia = ((query: string) =>
        ({
          matches: narrow && query === "(max-width: 639px)",
        }) as MediaQueryList) as typeof window.matchMedia;
    };

    beforeEach(() => {
      scrolledInto = [];
      HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
        scrolledInto.push(this);
      };
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    });

    it("brings the times into view after a day tap", async () => {
      stubViewport(true);
      const user = userEvent.setup({ delay: null });
      renderPicker();

      await user.click(
        screen.getByRole("button", {
          name: formatBookingMonthDayLabel(selectedDateKey, timeZone),
        }),
      );

      const heading = screen.getByRole("heading", { name: "Pick a time" });
      expect(scrolledInto).toHaveLength(1);
      expect(scrolledInto[0]?.contains(heading)).toBe(true);
    });

    it("leaves the two-pane layout alone on wide viewports", async () => {
      stubViewport(false);
      const user = userEvent.setup({ delay: null });
      renderPicker();

      await user.click(
        screen.getByRole("button", {
          name: formatBookingMonthDayLabel(selectedDateKey, timeZone),
        }),
      );

      expect(scrolledInto).toHaveLength(0);
    });
  });

  it("returns focus to the selected day on Escape from a slot", async () => {
    const user = userEvent.setup({ delay: null });
    renderPicker();

    const day = screen.getByRole("button", {
      name: formatBookingMonthDayLabel(selectedDateKey, timeZone),
    });
    const firstSlotButton = screen.getByRole("button", {
      name: formatBookingSlotTime(firstSlot, timeZone),
    });

    firstSlotButton.focus();
    await user.keyboard("{Escape}");
    expect(day).toHaveFocus();
  });
});
