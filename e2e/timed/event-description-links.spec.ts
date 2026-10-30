import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  fillTitleAndSaveEventForm,
  openEventForEditingWithKeyboard,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

test("description links shorten, keep hover copy, and open from shortcuts", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);

  const title = createEventTitle("Description links");
  const linkUrl = "https://one.example/meeting/a";

  await openTimedEventFormWithKeyboard(page);
  const description = page.getByRole("textbox", { name: "Description" });
  await description.click();
  await description.pressSequentially(`${linkUrl} with notes`, { delay: 10 });
  await fillTitleAndSaveEventForm(page, title);
  await openEventForEditingWithKeyboard(page, title);

  const link = page.locator(".tiptap a").first();
  await expect(link).toHaveText("one.example");
  await expect(link).toHaveAttribute("title", linkUrl);

  await page.evaluate(() => {
    (window as unknown as { __copied?: string }).__copied = "";
    navigator.clipboard.writeText = async (text: string) => {
      (window as unknown as { __copied?: string }).__copied = text;
    };
  });

  await link.hover();
  const copyButton = page.getByRole("button", { name: "Copy link" });
  await expect(copyButton).toBeVisible();
  await copyButton.hover();
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { __copied?: string }).__copied,
      ),
    )
    .toBe(linkUrl);

  const opened: string[] = [];
  await page.exposeFunction("recordOpened", (url: string) => {
    opened.push(url);
  });
  await page.evaluate(() => {
    window.open = (url?: string | URL) => {
      (
        window as unknown as { recordOpened: (url: string) => void }
      ).recordOpened(String(url ?? ""));
      return null;
    };
  });

  await link.hover();
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+Shift+Enter`);
  await expect.poll(() => opened.at(-1)).toBe(linkUrl);

  await description.click();
  await link.click();
  await page.keyboard.press(`${mod}+Shift+Enter`);
  await expect.poll(() => opened.at(-1)).toBe(linkUrl);

  await page.getByLabel("Title").click();
  await page.screenshot({
    path: test.info().outputPath("event-description-links-shortened.png"),
  });
  const savedHtml = await description.innerHTML();
  expect(savedHtml).toContain(linkUrl);
});
