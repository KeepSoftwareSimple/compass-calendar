import { expect, test } from "@playwright/test";
import {
  dispatchClick,
  dispatchFill,
  prepareGuestMeetingSetup,
} from "./booking-harness";

const GUEST_GO_LIVE = "Start your free trial to publish your meeting page";

// The `/meet` landing link itself is covered by meet-landing.spec.ts. This
// starts where that link lands: a signed-out visitor on `/?meetingSetup=1`.
test("guest setup survives sign-up and fixes a taken address before going live", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const harness = await prepareGuestMeetingSetup(page, {
    takenSlug: "taken-name",
  });

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  const address = settingsDialog.getByLabel("Page address");
  const continueButton = settingsDialog.getByRole("button", {
    name: /^Continue/,
  });

  await expect(settingsDialog.getByText(/^Step 1 of \d+$/)).toBeVisible({
    timeout: 15000,
  });
  await dispatchFill(address, "taken-name");
  await dispatchClick(continueButton);
  await expect(settingsDialog.getByText(/^Step 2 of \d+$/)).toBeVisible();
  await dispatchClick(continueButton);
  await expect(settingsDialog.getByText(/^Step 3 of \d+$/)).toBeVisible();
  await dispatchClick(continueButton);

  await expect(
    settingsDialog.getByRole("heading", { name: "Ready to go live" }),
  ).toBeVisible();
  await expect(
    settingsDialog.getByText("Your connected calendar, after sign-up"),
  ).toBeVisible();
  // The guest wizard is local only: nothing reaches the API before sign-up.
  expect(harness.putBodies).toEqual([]);

  await dispatchClick(
    settingsDialog.getByRole("button", { name: GUEST_GO_LIVE }),
  );
  await expect(settingsDialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: /nice to meet you/i }),
  ).toBeVisible();

  await harness.completeSignUp();

  await expect(
    settingsDialog.getByRole("heading", { name: "Ready to go live" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(settingsDialog.getByText("Work (Google Meet)")).toBeVisible();

  await dispatchClick(
    settingsDialog.getByRole("button", { name: /Turn on and copy link/ }),
  );

  await expect(
    settingsDialog.getByRole("heading", { name: "Pick your address" }),
  ).toBeVisible();
  await expect(settingsDialog.getByRole("alert")).toHaveText(
    "That address is already taken. Try another.",
  );
  await expect(address).toBeFocused();
  expect(harness.putBodies).toHaveLength(1);
  expect(harness.putBodies[0]).toMatchObject({
    enabled: true,
    slug: "taken-name",
  });

  await dispatchFill(address, "free-name");
  await dispatchClick(continueButton);
  await expect(settingsDialog.getByText(/^Step 2 of \d+$/)).toBeVisible();
  expect(harness.putBodies[1]).toMatchObject({
    enabled: false,
    slug: "free-name",
  });
  await dispatchClick(continueButton);
  await dispatchClick(continueButton);
  await dispatchClick(
    settingsDialog.getByRole("button", { name: /Turn on and copy link/ }),
  );

  await expect(
    page.getByText("Your meeting page is live. Link copied."),
  ).toBeVisible();
  expect(harness.putBodies.at(-1)).toMatchObject({
    enabled: true,
    slug: "free-name",
  });
  await expect(
    settingsDialog.getByRole("textbox", { name: "Meeting link" }),
  ).toHaveValue("https://compasscalendar.com/meet/free-name");
  // Go-live success is the only thing that clears the guest draft.
  expect(
    await page.evaluate(() =>
      localStorage.getItem("compass.booking.guest-meeting-setup-draft"),
    ),
  ).toBeNull();
});
