import { expect, test } from "@playwright/test";
import {
  buildSameDaySiblingSlot,
  buildUpcomingSaturdaySlot,
  formatMonthDayButtonLabel,
  formatSlotButtonLabel,
  preparePublicBookingReschedulePage,
} from "./booking-harness";

test.describe("public booking reschedule current slot", () => {
  test("opens on the meeting day and omits the current slot from the list", async ({
    page,
  }) => {
    const reservationSlot = buildUpcomingSaturdaySlot();
    const alternateSlot = buildSameDaySiblingSlot(reservationSlot);
    await preparePublicBookingReschedulePage(page, {
      slots: [reservationSlot, alternateSlot],
      guestTimeZone: "UTC",
    });

    await expect(
      page.getByRole("button", {
        name: formatMonthDayButtonLabel(reservationSlot.slotStart, "UTC"),
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(reservationSlot.slotStart, "UTC"),
      }),
    ).toHaveCount(0);

    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(alternateSlot.slotStart, "UTC"),
      }),
    ).toBeVisible();
  });
});
