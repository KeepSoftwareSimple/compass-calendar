import { expect, test } from "@playwright/test";

// `/life` is a public lead magnet: first-time visitors can click like a
// normal page. Calendar views teach pointer intent (see mouse-teaches.spec.ts).
test("life page allows pointer clicks without the keyboard-only hint", async ({
  page,
}) => {
  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();

  await page
    .getByRole("button", { name: "Next life variation", exact: true })
    .click();
  await expect(page.getByText("Long", { exact: true })).toBeVisible();
  await expect(page.locator("[data-pointer-hint]")).toHaveCount(0);

  await page.getByRole("textbox", { name: "Date of birth" }).click();
  await expect(
    page.getByRole("button", { name: "Previous month" }),
  ).toBeVisible();
  await expect(page.locator("[data-pointer-hint]")).toHaveCount(0);
});
