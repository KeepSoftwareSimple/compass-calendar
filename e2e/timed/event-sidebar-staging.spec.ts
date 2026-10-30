import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  fillTitleAndSaveEventForm,
  openEventForEditingWithKeyboard,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

test("description links are focusable and copy with Mod+Shift+C", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);

  const title = createEventTitle("Link copy");
  const linkUrl = "https://example.com/meeting-room";

  await openTimedEventFormWithKeyboard(page);
  const description = page.getByRole("textbox", { name: "Description" });
  await description.click();
  await description.pressSequentially(`Join at ${linkUrl} `, { delay: 15 });
  await fillTitleAndSaveEventForm(page, title);
  await openEventForEditingWithKeyboard(page, title);

  const link = page.getByRole("link", { name: "example.com" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("aria-label", /example\.com/);
  await link.focus();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __copied?: string }).__copied = "";
    navigator.clipboard.writeText = async (text: string) => {
      (window as unknown as { __copied?: string }).__copied = text;
    };
  });

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { __copied?: string }).__copied,
      ),
    )
    .toBe(linkUrl);

  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+Shift+C`);
  await expect(page.getByText("Link copied")).toBeVisible();
});
