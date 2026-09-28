import { expect, test } from "@playwright/test";
import {
  buildEventFixture,
  openEventForm,
  prepareSignedInGooglePage,
} from "../attendees/attendee-harness";
import {
  BOOKED_MEETING_CANCEL_TOKEN,
  BOOKED_MEETING_RESERVATION_ID,
  bookedMeetingDescription,
  dispatchClick,
} from "./booking-harness";

const MEETING_TITLE = "Booked with Bob";

function bookedMeetingEvent(id: string) {
  const event = buildEventFixture({
    id,
    title: MEETING_TITLE,
    attendees: [
      {
        email: "bob@example.com",
        displayName: "Bob",
        responseStatus: "accepted",
      },
    ],
  });
  event.content.description = bookedMeetingDescription();
  return event;
}

test.describe("booked meeting event form actions", () => {
  test("Cancel meeting confirms on a second click and posts the public cancel endpoint", async ({
    page,
  }) => {
    await prepareSignedInGooglePage(page, {
      events: [bookedMeetingEvent("booked-meeting-1")],
    });

    const cancelPosts: Array<Record<string, unknown>> = [];
    await page.route("**/api/booking/reservations/**/cancel", async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        return route.continue();
      }
      cancelPosts.push(
        (request.postDataJSON() ?? {}) as Record<string, unknown>,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await openEventForm(page, MEETING_TITLE);

    const actionRow = page.getByRole("group", { name: "Event actions" });
    await dispatchClick(
      actionRow.getByRole("button", { name: "Cancel meeting" }),
    );
    await dispatchClick(
      actionRow.getByRole("button", { name: "Confirm cancel" }),
    );

    await expect.poll(() => cancelPosts.length).toBe(1);
    expect(cancelPosts[0]).toEqual({ token: BOOKED_MEETING_CANCEL_TOKEN });
  });

  test("Reschedule opens the guest reschedule page in a new tab", async ({
    page,
  }) => {
    await prepareSignedInGooglePage(page, {
      events: [bookedMeetingEvent("booked-meeting-2")],
    });

    await openEventForm(page, MEETING_TITLE);

    const popupPromise = page.waitForEvent("popup");
    await dispatchClick(
      page
        .getByRole("group", { name: "Event actions" })
        .getByRole("button", { name: "Reschedule" }),
    );
    const popup = await popupPromise;

    await expect(popup).toHaveURL(
      new RegExp(
        `/meet/reschedule/${BOOKED_MEETING_RESERVATION_ID}\\?token=${BOOKED_MEETING_CANCEL_TOKEN}`,
      ),
    );
  });
});
