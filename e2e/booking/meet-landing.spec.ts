import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../utils/axe-assertion";
import { publicBookingAppUrl } from "./booking-harness";

const HEADING = "Compass Calendar Meetings";
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
