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
  await expect(link).toHaveAttribute("aria-label", /one\.example/);
  await expect(link).not.toHaveAttribute("title");

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

test("description link preview stays inside the sidebar for a long trailing URL", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);

  const title = createEventTitle("Description link preview");
  const longUrl =
    "https://www.esmailcorp.com/news/mr-robot-final-season-premiere";

  await openTimedEventFormWithKeyboard(page);
  const description = page.getByRole("textbox", { name: "Description" });
  await description.click();
  await description.pressSequentially("1. first line\n2. ", { delay: 5 });
  await description.pressSequentially(`${longUrl}\n`, { delay: 5 });
  await fillTitleAndSaveEventForm(page, title);
  await openEventForEditingWithKeyboard(page, title);

  const link = page.getByRole("link", { name: /esmailcorp/i });
  await link.hover();
  const hint = page.getByRole("group", { name: "Link shortcut and copy" });
  await expect(hint).toBeVisible();

  const bounds = await page.evaluate(() => {
    const sidebar = document.querySelector("aside");
    const hintGroup = document.querySelector(
      'fieldset[aria-label="Link shortcut and copy"]',
    );
    if (!sidebar || !hintGroup) return null;
    const panel = sidebar.getBoundingClientRect();
    const chrome = hintGroup.getBoundingClientRect();
    return {
      panelLeft: panel.left,
      panelRight: panel.right,
      chromeLeft: chrome.left,
      chromeRight: chrome.right,
      portaledOutsideSidebar: !sidebar.contains(hintGroup),
    };
  });

  expect(bounds).not.toBeNull();
  expect(bounds?.portaledOutsideSidebar).toBe(true);
  expect(bounds?.chromeLeft).toBeGreaterThanOrEqual(bounds!.panelLeft - 1);
  expect(bounds?.chromeRight).toBeLessThanOrEqual(bounds!.panelRight + 1);

  await expect(hint.locator("span[title]")).toHaveAttribute("title", longUrl);
});
