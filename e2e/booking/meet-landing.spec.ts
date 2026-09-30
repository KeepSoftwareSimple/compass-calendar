import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../utils/axe-assertion";
import { publicBookingAppUrl } from "./booking-harness";

const HEADING = "Let people book time with you";

// A <footer> inside <main> has no contentinfo role, so the footer's one link
// is the count that proves the page shell rendered once.

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
    await expect(page).toHaveTitle("Meeting pages - Compass");
    await expect(
      page.getByRole("link", { name: "Set up your meeting page" }),
    ).toHaveAttribute("href", "/?meetingSetup=1");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Set up your own meeting page" }),
    ).toHaveCount(1);
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
