import { expect, test } from "@playwright/test";
import {
  buildBookableSlot,
  buildSameDaySiblingSlot,
  formatMonthDayButtonLabel,
  formatSlotButtonLabel,
  preparePublicBookingReschedulePage,
} from "./booking-harness";

test.describe("public booking reschedule picker (v1.11)", () => {
  test("omits the current slot and selects the meeting day on load", async ({
    page,
  }) => {
    const reservationSlot = buildBookableSlot();
    const alternateSlot = buildSameDaySiblingSlot(reservationSlot);
    await preparePublicBookingReschedulePage(page, {
      slots: [reservationSlot, alternateSlot],
    });

    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(reservationSlot.slotStart),
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(alternateSlot.slotStart),
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: formatMonthDayButtonLabel(reservationSlot.slotStart),
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
