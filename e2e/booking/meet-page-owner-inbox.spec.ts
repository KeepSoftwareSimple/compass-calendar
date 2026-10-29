import { expect, test } from "@playwright/test";
import {
  preparePublicBookingPage,
  publicBookingAppUrl,
} from "./booking-harness";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const artifactDir = "/opt/cursor/artifacts/meet-owner-inbox";

async function captureViewport(
  page: import("@playwright/test").Page,
  name: string,
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.screenshot({
    path: join(artifactDir, `${name}-${width}.png`),
    fullPage: true,
  });
}

test.describe("meet page owner inbox", () => {
  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  test("guest view hides the owner inbox", async ({ page }) => {
    await preparePublicBookingPage(page, { ownerUpcomingMode: "unauthorized" });
    await page.goto(publicBookingAppUrl("/meet/tylerdane"), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeVisible();
    expect(
      page.getByRole("heading", { name: "Your upcoming bookings" }),
    ).toHaveCount(0);
    await captureViewport(page, "guest-view", 1280);
    await captureViewport(page, "guest-view", 360);
  });

  test("owner empty state", async ({ page }) => {
    await preparePublicBookingPage(page, { ownerUpcomingMode: "empty" });
    await page.goto(publicBookingAppUrl("/meet/tylerdane"), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByText("No upcoming bookings through this page yet."),
    ).toBeVisible();
    await captureViewport(page, "owner-empty", 1280);
    await captureViewport(page, "owner-empty", 360);
  });

  test("owner list and cancel confirmation", async ({ page }) => {
    await preparePublicBookingPage(page, { ownerUpcomingMode: "list" });
    await page.goto(publicBookingAppUrl("/meet/tylerdane"), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Your upcoming bookings" }),
    ).toBeVisible();
    await expect(
      page.getByText("Ada Lovelace · ada@example.com"),
    ).toBeVisible();
    await expect(
      page.getByText("Grace Hopper · grace@example.com"),
    ).toBeVisible();
    await expect(
      page.getByText("Alan Turing · alan@example.com"),
    ).toBeVisible();
    await expect(page.getByText(/Oct 31.*30 min/)).toBeVisible();
    await expect(page.getByText(/Nov 1.*45 min/)).toBeVisible();
    await expect(page.getByText(/Nov 3.*1 hr/)).toBeVisible();
    await captureViewport(page, "owner-with-bookings", 1280);
    await captureViewport(page, "owner-with-bookings", 360);

    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expect(
      page.getByRole("alertdialog", { name: "Cancel this booking?" }),
    ).toBeVisible();
    await captureViewport(page, "cancel-confirmation", 1280);
    await captureViewport(page, "cancel-confirmation", 360);
  });
});
