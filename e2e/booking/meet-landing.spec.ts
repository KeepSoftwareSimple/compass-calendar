import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../utils/axe-assertion";
import { publicBookingAppUrl } from "./booking-harness";

const HEADING = "Let people book time with you";
const DOCUMENT_TITLE = "Simple booking page and Calendly alternative - Compass";

test.describe("meeting landing page", () => {
  test("bare /meet renders the landing page with one page shell", async ({
    page,
  }) => {
    await page.goto(publicBookingAppUrl("/meet"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { level: 1, name: HEADING }),
    ).toBeVisible();
    await expect(page).toHaveTitle(DOCUMENT_TITLE);
    await expect(
      page.getByRole("link", { name: "Set up your meeting page" }),
    ).toHaveAttribute("href", "/?meetingSetup=1");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Set up your own meeting page" }),
    ).toHaveCount(0);
    await expect(page.getByText(/7-day trial/i)).toHaveCount(0);
    await expect(page.getByText(/Already use Compass/i)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("/meet/ with a trailing slash renders the same page", async ({
    page,
  }) => {
    await page.goto(publicBookingAppUrl("/meet/"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { level: 1, name: HEADING }),
    ).toBeVisible();
  });

  test("visitors can try a booking and return to the example times", async ({
    page,
  }) => {
    await page.goto(publicBookingAppUrl("/meet"));
    const example = page.getByRole("region", { name: "What your guests see" });
    const time = example.getByRole("button", { name: "10:00 AM" });

    await time.press("Enter");
    await expect(
      example.getByRole("heading", { name: "Your details" }),
    ).toBeFocused();
    await expect(example.getByRole("textbox", { name: "Email" })).toHaveValue(
      "sam@example.com",
    );
    await example
      .getByRole("button", { name: "Confirm example booking" })
      .click();
    await expect(
      example.getByRole("heading", { name: "You’re meeting with Alex Chen" }),
    ).toBeFocused();
    await example
      .getByRole("button", { name: "Back to available times" })
      .click();
    await expect(
      example.getByRole("heading", { name: "Pick a time" }),
    ).toBeFocused();
    await expect(time).toHaveAttribute("aria-pressed", "true");
  });

  test("an unknown /meet path shows one not-found shell that links to the landing page", async ({
    page,
  }) => {
    await page.goto(publicBookingAppUrl("/meet/nope/extra/segments"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Set up your own meeting page" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "See how meeting pages work" }),
    ).toHaveAttribute("href", "/meet");
  });
});
