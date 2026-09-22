import { expect, type Page, test } from "@playwright/test";
import {
  buildBookableSlot,
  buildSameDaySiblingSlot,
  formatSlotButtonLabel,
  formatSlotWhenLabel,
  preparePublicBookingPage,
  preparePublicBookingReschedulePage,
  publicBookingAppUrl,
} from "./booking-harness";

async function guestTimeZone(page: Page): Promise<string> {
  return page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
}

test.describe("public booking reschedule", () => {
  test("confirm then reschedule to a new slot shows the new time", async ({
    page,
  }) => {
    const first = buildBookableSlot();
    const second = buildSameDaySiblingSlot(first);
    const captured = await preparePublicBookingPage(page, {
      slots: [first, second],
    });
    const timeZone = await guestTimeZone(page);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(first.slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();
    await expect(
      page.getByText(formatSlotWhenLabel(first.slotStart, timeZone)),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Reschedule this meeting" }),
    ).toBeVisible();

    const rescheduleHref = await page
      .getByRole("link", { name: "Reschedule this meeting" })
      .getAttribute("href");
    expect(rescheduleHref).toContain(
      "/meet/reschedule/000000000000000000000099?token=abc",
    );
    // Create returns an absolute compasscalendar.com URL; follow its path on
    // the Playwright origin instead of leaving the stubbed app.
    const rescheduleUrl = new URL(rescheduleHref ?? "", page.url());
    await page.goto(
      publicBookingAppUrl(`${rescheduleUrl.pathname}${rescheduleUrl.search}`),
    );

    await expect(page).toHaveURL(
      /\/meet\/reschedule\/000000000000000000000099\?token=abc/,
    );
    await expect(
      page.getByRole("heading", {
        name: "Reschedule your meeting with Tyler Dane",
      }),
    ).toBeFocused();

    await page
      .getByRole("button", { name: formatSlotButtonLabel(second.slotStart) })
      .click();
    await page.getByRole("button", { name: "Confirm" }).click();

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeVisible();
    await expect(
      page.getByText(formatSlotWhenLabel(second.slotStart, timeZone)),
    ).toBeVisible();
    await expect(
      page.getByText(formatSlotWhenLabel(first.slotStart, timeZone)),
    ).toHaveCount(0);
    expect(captured.reschedulePosts).toHaveLength(1);
    expect(captured.reschedulePosts[0]).toMatchObject({
      token: "abc",
      slotStart: second.slotStart,
      durationMinutes: 30,
    });
  });

  test("reaches Confirm with the keyboard", async ({ page }) => {
    const { slotStart } = buildBookableSlot();
    const captured = await preparePublicBookingReschedulePage(page);

    await expect(
      page.getByRole("heading", {
        name: "Reschedule your meeting with Tyler Dane",
      }),
    ).toBeFocused();

    const slotButton = page.getByRole("button", {
      name: formatSlotButtonLabel(slotStart),
    });
    await slotButton.focus();
    await page.keyboard.press("Enter");

    const confirm = page.getByRole("button", { name: "Confirm" });
    await expect(confirm).toBeVisible();
    for (let hop = 0; hop < 20; hop += 1) {
      if (await confirm.evaluate((el) => el === document.activeElement)) {
        break;
      }
      await page.keyboard.press("Tab");
    }
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeVisible();
    expect(captured.reschedulePosts).toHaveLength(1);
    expect(captured.reschedulePosts[0]).toMatchObject({
      token: "abc",
      slotStart,
      durationMinutes: 30,
    });
  });

  test("missing token is not-found and does not fetch slots", async ({
    page,
  }) => {
    const captured = await preparePublicBookingReschedulePage(page, {
      token: "",
    });

    await expect(
      page.getByRole("heading", { name: "Meeting not found" }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", {
        name: "Reschedule your meeting with Tyler Dane",
      }),
    ).toHaveCount(0);
    expect(captured.reservationSlotGets).toBe(0);
    expect(captured.reschedulePosts).toHaveLength(0);
  });

  test("shows unavailable when the host calendar is not bookable", async ({
    page,
  }) => {
    await preparePublicBookingReschedulePage(page, { bookable: false });

    const heading = page.getByRole("heading", {
      name: "Meeting temporarily unavailable",
    });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(heading).toHaveAttribute("id", "booking-status-heading");
    await expect(
      page.getByText("The host calendar is not ready for new meetings."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Reschedule your meeting with Tyler Dane",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Previous month" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next month" })).toHaveCount(
      0,
    );
  });
});
