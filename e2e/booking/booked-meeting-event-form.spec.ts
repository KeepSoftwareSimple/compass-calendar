import { expect, test } from "@playwright/test";
import {
  BOOKED_MEETING_CANCEL_TOKEN,
  BOOKED_MEETING_RESERVATION_ID,
  prepareBookedMeetingEventFormPage,
} from "./booking-harness";

test.describe("booked meeting event form actions", () => {
  test("cancel meeting uses a confirm step then posts cancel", async ({
    page,
  }) => {
    const captured = await prepareBookedMeetingEventFormPage(page);
    const actions = page.getByRole("group", { name: "Event actions" });

    await actions.getByRole("button", { name: "Cancel meeting" }).click();
    await actions.getByRole("button", { name: "Confirm cancel" }).click();

    await expect(page.getByRole("form")).toBeHidden({ timeout: 10000 });
    expect(captured.cancelPosts).toHaveLength(1);
    expect(captured.cancelPosts[0]).toMatchObject({
      token: BOOKED_MEETING_CANCEL_TOKEN,
    });
  });

  test("reschedule opens the guest reschedule page in a new tab", async ({
    page,
    context,
  }) => {
    await prepareBookedMeetingEventFormPage(page);
    const popupPromise = context.waitForEvent("page");

    await page
      .getByRole("group", { name: "Event actions" })
      .getByRole("button", { name: "Reschedule" })
      .click();

    const popup = await popupPromise;
    await expect(popup).toHaveURL(
      new RegExp(
        `/meet/reschedule/${BOOKED_MEETING_RESERVATION_ID}\\?token=${BOOKED_MEETING_CANCEL_TOKEN}`,
      ),
    );
  });
});
