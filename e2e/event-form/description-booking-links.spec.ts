import { expect, test } from "@playwright/test";
import {
  buildEventFixture,
  prepareSignedInGooglePage,
} from "../attendees/attendee-harness";

// Regression: a booking event's description is two links in one paragraph
// ("Cancel | Reschedule"). Opening it froze the tab: the link chrome's
// MutationObserver wrote tabindex/title/class onto ProseMirror's <a> nodes,
// ProseMirror redrew them, and the observer fired again, forever.

const BOOKING_DESCRIPTION =
  'Catch up<br><br><a href="https://compasscalendar.com/meet/host/cancel?token=abc">Cancel</a> | <a href="https://compasscalendar.com/meet/host/reschedule?token=abc">Reschedule</a>';

/** Resolves when the page's main thread runs a timer, or reports a freeze. */
const mainThreadResponds = (page: import("@playwright/test").Page) =>
  Promise.race([
    page.evaluate(
      () =>
        new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 100)),
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve("frozen"), 5000)),
  ]);

test("Enter on a booking event with Cancel | Reschedule links opens the form without freezing", async ({
  page,
}) => {
  await prepareSignedInGooglePage(page, {
    events: [
      buildEventFixture({
        id: "evt-booking-links",
        title: "Guest and Host",
        description: BOOKING_DESCRIPTION,
        attendees: [
          {
            email: "guest@example.com",
            displayName: "Guest",
            responseStatus: "accepted",
          },
        ],
      }),
    ],
  });

  const card = page.getByRole("button", { name: /Guest and Host/ }).last();
  await card.waitFor({ state: "visible", timeout: 15000 });
  await card.focus();
  await page.keyboard.press("Enter");

  expect(await mainThreadResponds(page)).toBe("ok");
  await expect(page.getByRole("form").getByPlaceholder("Title")).toHaveValue(
    "Guest and Host",
  );

  const cancelLink = page
    .getByRole("form")
    .getByRole("link", { name: "Cancel" });
  const rescheduleLink = page
    .getByRole("form")
    .getByRole("link", { name: "Reschedule" });
  await expect(cancelLink).toHaveAttribute("tabindex", "0");
  await expect(rescheduleLink).toHaveAttribute("tabindex", "0");
  await expect(cancelLink).toHaveAttribute(
    "title",
    "https://compasscalendar.com/meet/host/cancel?token=abc",
  );
  await expect(rescheduleLink).toHaveClass(/c-focus-ring/);

  expect(await mainThreadResponds(page)).toBe("ok");
});
