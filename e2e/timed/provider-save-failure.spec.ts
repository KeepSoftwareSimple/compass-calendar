import { expect, test } from "@playwright/test";
import {
  buildEventFixture,
  clickSave,
  openEventForm,
  prepareSignedInGooglePage,
} from "../attendees/attendee-harness";

test.describe("provider save failure feedback", () => {
  test("shows Google Calendar copy and keeps the form open when the provider rejects a save", async ({
    page,
  }) => {
    const title = "Provider failure edit";
    const event = buildEventFixture({
      id: "evt-provider-fail-1",
      title,
    });

    await prepareSignedInGooglePage(page, { events: [event] });

    await page.route("**/api/event/**", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          code: "PROVIDER_FAILURE",
          message: "Sync command failed (permanentProviderError)",
          retryable: true,
          provider: "google",
        }),
      });
    });

    await openEventForm(page, title);
    await page.getByRole("textbox", { name: "Description" }).click();
    await page
      .getByRole("textbox", { name: "Description" })
      .fill("<p>Updated notes</p>");
    await clickSave(page);

    await expect(
      page.getByText(
        "Couldn't save to Google Calendar. Your change wasn't saved.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    await page.screenshot({
      path: test.info().outputPath("provider-save-failure-google-toast.png"),
      fullPage: false,
    });
  });
});
