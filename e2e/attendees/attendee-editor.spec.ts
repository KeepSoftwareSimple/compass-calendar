import { expect, test } from "@playwright/test";
import {
  ACCOUNT_EMAIL,
  buildEventFixture,
  clickSave,
  dispatchClick,
  getGuestCombobox,
  MICROSOFT_ACCOUNT_EMAIL,
  MICROSOFT_CALENDAR_ID,
  openEventForm,
  prepareSignedInGooglePage,
  prepareSignedInMicrosoftPage,
} from "./attendee-harness";

// Attendee editor end-to-end (WP-04/WP-09): adding guests on an organized,
// writable-Google event, the save-time "Send invitation emails?" prompt, and
// the exact replace payload (guest set + invitation intent) on the wire.

const organizedEvent = () =>
  buildEventFixture({
    id: "evt-guests-1",
    title: "Design Review",
    attendees: [
      { email: ACCOUNT_EMAIL, displayName: null, responseStatus: "accepted" },
      {
        email: "bob@example.com",
        displayName: "Bob B",
        responseStatus: "accepted",
      },
    ],
  });

test("adding a guest prompts to send invitations and puts the replaced guest set on the wire", async ({
  page,
}) => {
  const captured = await prepareSignedInGooglePage(page, {
    events: [organizedEvent()],
  });

  await openEventForm(page, "Design Review");

  await expect(page.getByText("2 guests (2 yes, 0 awaiting)")).toBeVisible();
  await expect(page.getByLabel("Bob B, yes")).toBeVisible();

  const combobox = getGuestCombobox(page);
  await combobox.fill("dana@example.com");
  await page.keyboard.press("Enter");
  // The chip is on screen before anything reaches the wire.
  await expect(
    page.getByRole("button", { name: "Remove dana@example.com" }),
  ).toBeVisible();

  await clickSave(page);

  // Guest set changed -> the Send prompt appears BEFORE any mutation.
  await expect(page.getByText("Send invitation emails?")).toBeVisible();
  expect(captured.replaceRequests).toHaveLength(0);

  await dispatchClick(page.getByRole("button", { name: "Send", exact: true }));

  await expect.poll(() => captured.replaceRequests.length).toBe(1);
  const { eventId, body } = captured.replaceRequests[0];
  expect(eventId).toBe("evt-guests-1");
  const content = body.content as Record<string, unknown>;
  // Write-input shape: membership only, no responseStatus on any entry.
  expect(content.attendees).toEqual([
    { email: ACCOUNT_EMAIL, displayName: null },
    { email: "bob@example.com", displayName: "Bob B" },
    { email: "dana@example.com", displayName: null },
  ]);
  // "Send" -> Google emails the affected guests.
  expect(body.invitation).toBe("all");

  // The form closes after the save is submitted.
  await expect(page.getByRole("form").getByPlaceholder("Title")).toBeHidden();
});

test("adding a guest on one occurrence of a series saves the whole series", async ({
  page,
}) => {
  const seriesId = "evt-series-guests";
  const captured = await prepareSignedInGooglePage(page, {
    events: [
      buildEventFixture({
        id: `${seriesId}::20260601T100000Z`,
        title: "Weekly Sync",
        recurrence: { kind: "occurrence", seriesId },
        attendees: [
          {
            email: ACCOUNT_EMAIL,
            displayName: null,
            responseStatus: "accepted",
          },
        ],
      }),
    ],
  });

  await openEventForm(page, "Weekly Sync");

  // The editor renders on an occurrence, and says where the edit lands.
  await expect(
    page.getByText("Guest changes apply to all events in this series."),
  ).toBeVisible();

  const combobox = getGuestCombobox(page);
  await combobox.fill("dana@example.com");
  await page.keyboard.press("Enter");

  await clickSave(page);
  await dispatchClick(page.getByRole("button", { name: "Send", exact: true }));

  await expect.poll(() => captured.replaceRequests.length).toBe(1);
  const { eventId, body } = captured.replaceRequests[0];
  // The composite occurrence id still addresses the request; the backend
  // collapses it to the series master because the scope is "all".
  expect(eventId).toBe(`${seriesId}::20260601T100000Z`);
  expect(body.scope).toBe("all");
  const content = body.content as Record<string, unknown>;
  expect(content.attendees).toEqual([
    { email: ACCOUNT_EMAIL, displayName: null },
    { email: "dana@example.com", displayName: null },
  ]);
  expect(body.invitation).toBe("all");
});

test("choosing Don't send saves the guest edit with invitation none", async ({
  page,
}) => {
  const captured = await prepareSignedInGooglePage(page, {
    events: [organizedEvent()],
  });

  await openEventForm(page, "Design Review");

  const combobox = getGuestCombobox(page);
  await combobox.fill("erin@example.com");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Remove erin@example.com" }),
  ).toBeVisible();

  await clickSave(page);
  await expect(page.getByText("Send invitation emails?")).toBeVisible();
  await dispatchClick(page.getByRole("button", { name: "Don't send" }));

  await expect.poll(() => captured.replaceRequests.length).toBe(1);
  const { body } = captured.replaceRequests[0];
  const content = body.content as Record<string, unknown>;
  expect(content.attendees).toEqual([
    { email: ACCOUNT_EMAIL, displayName: null },
    { email: "bob@example.com", displayName: "Bob B" },
    { email: "erin@example.com", displayName: null },
  ]);
  expect(body.invitation).toBe("none");
});

test("a save that never touched the guest list sends no attendees key and shows no prompt", async ({
  page,
}) => {
  const captured = await prepareSignedInGooglePage(page, {
    events: [organizedEvent()],
  });

  await openEventForm(page, "Design Review");

  await page
    .getByRole("form")
    .getByPlaceholder("Title")
    .fill("Design Review (moved)");
  await clickSave(page);

  await expect.poll(() => captured.replaceRequests.length).toBe(1);
  // No prompt appeared: the save went straight to the wire...
  await expect(page.getByText("Send invitation emails?")).toBeHidden();
  const { body } = captured.replaceRequests[0];
  const content = body.content as Record<string, unknown>;
  // ...and the body carries neither an attendees key ("not editing guests" —
  // provider membership flows through untouched) nor an invitation key.
  expect("attendees" in content).toBe(false);
  expect("invitation" in body).toBe(false);
});

test("an invalid email never becomes a chip", async ({ page }) => {
  const captured = await prepareSignedInGooglePage(page, {
    events: [organizedEvent()],
  });

  await openEventForm(page, "Design Review");

  const combobox = getGuestCombobox(page);
  await combobox.fill("not-an-email");
  await page.keyboard.press("Enter");

  // Inline rejection in the listbox; no chip, nothing on the wire.
  await expect(
    page.getByText("No matches. Type their full email."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove not-an-email" }),
  ).toHaveCount(0);
  expect(captured.replaceRequests).toHaveLength(0);
});

test("adding a guest on a Microsoft calendar puts the replaced guest set on the wire", async ({
  page,
}) => {
  const captured = await prepareSignedInMicrosoftPage(page, {
    events: [
      buildEventFixture({
        id: "evt-ms-guests-1",
        title: "Planning Review",
        calendarId: MICROSOFT_CALENDAR_ID,
        attendees: [
          {
            email: MICROSOFT_ACCOUNT_EMAIL,
            displayName: null,
            responseStatus: "accepted",
          },
          {
            email: "bob@example.com",
            displayName: "Bob B",
            responseStatus: "accepted",
          },
        ],
      }),
    ],
  });

  await openEventForm(page, "Planning Review");

  await expect(page.getByText("2 guests (2 yes, 0 awaiting)")).toBeVisible();

  const combobox = getGuestCombobox(page);
  await combobox.fill("dana@example.com");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Remove dana@example.com" }),
  ).toBeVisible();

  await clickSave(page);
  await expect(page.getByText("Send invitation emails?")).toBeVisible();
  await dispatchClick(page.getByRole("button", { name: "Send", exact: true }));

  await expect.poll(() => captured.replaceRequests.length).toBe(1);
  const { eventId, body } = captured.replaceRequests[0];
  expect(eventId).toBe("evt-ms-guests-1");
  const content = body.content as Record<string, unknown>;
  expect(content.attendees).toEqual([
    { email: MICROSOFT_ACCOUNT_EMAIL, displayName: null },
    { email: "bob@example.com", displayName: "Bob B" },
    { email: "dana@example.com", displayName: null },
  ]);
  expect(body.invitation).toBe("all");
  await expect(page.getByRole("form").getByPlaceholder("Title")).toBeHidden();
});
