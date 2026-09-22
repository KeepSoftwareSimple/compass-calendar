import { PublicBookingMonthNav } from "@booking-web/booking/PublicBookingMonthNav";
import {
  formatBookingMonthHeading,
  formatBookingMonthKey,
  shiftBookingMonthKey,
} from "@booking-web/booking/public-booking.format";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "@core/util/date/dayjs";
import { describe, expect, it } from "bun:test";

const timeZone = "UTC";

describe("PublicBookingMonthNav", () => {
  it("disables previous on the current month and prefetches the next month on hover", async () => {
    const user = userEvent.setup({ delay: null });
    const monthKey = formatBookingMonthKey(dayjs(), timeZone);
    const nextMonthKey = shiftBookingMonthKey(monthKey, 1, timeZone);
    const prefetched: string[] = [];
    const changed: string[] = [];

    render(
      <PublicBookingMonthNav
        monthKey={monthKey}
        timeZone={timeZone}
        maxHorizonDays={60}
        onMonthChange={(next) => {
          changed.push(next);
        }}
        onPrefetchMonth={(next) => {
          prefetched.push(next);
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: formatBookingMonthHeading(monthKey, timeZone),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous month" }),
    ).toBeDisabled();

    const nextButton = screen.getByRole("button", { name: "Next month" });
    expect(nextButton).toBeEnabled();
    await user.hover(nextButton);
    expect(prefetched).toEqual([nextMonthKey]);

    await user.click(nextButton);
    expect(changed).toEqual([nextMonthKey]);
  });
});
