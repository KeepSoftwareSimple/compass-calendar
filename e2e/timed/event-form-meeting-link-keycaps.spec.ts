import { expect, test } from "@playwright/test";
import {
  installDeterministicBrowserClock,
  openEventForEditingWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";
import { seedLocalEvents } from "../utils/local-event-seed.util";

const MEET_TITLE = "Keyboard meet link";
const MEET_URL = "https://meet.google.com/abc-defg-hij";

test("shows meeting-link copy keycaps and copies with Mod+Shift+L", async ({
  page,
}, testInfo) => {
  await installDeterministicBrowserClock(page);
  await prepareTimedCalendarPage(page);

  await seedLocalEvents(page, [
    {
      id: "e2e0000000000000000000001",
      content: {
        kind: "details",
        title: MEET_TITLE,
        description: "",
        conference: { url: MEET_URL, label: "Google Meet" },
      },
      schedule: {
        kind: "timed",
        start: "2026-04-24T15:00:00.000Z",
        end: "2026-04-24T16:00:00.000Z",
        timeZone: "UTC",
      },
      createdAt: "2026-04-24T10:00:00.000Z",
    },
  ]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#mainGrid").waitFor({ state: "visible", timeout: 15000 });

  await openEventForEditingWithKeyboard(page, MEET_TITLE);

  const form = page.getByRole("form");
  await expect(form.getByRole("link", { name: "Google Meet" })).toBeVisible();
  const meetCopy = form.getByRole("button", { name: "copy meeting link" });
  await expect(meetCopy).toBeVisible();
  await expect(
    meetCopy.locator("xpath=..").getByTestId("l-icon"),
  ).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __copied?: string }).__copied = "";
    navigator.clipboard.writeText = async (text: string) => {
      (window as unknown as { __copied?: string }).__copied = text;
    };
  });

  const title = page.getByRole("form").getByPlaceholder("Title");
  await title.focus();
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+Shift+L`);

  await expect(page.getByText("Link copied")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as { __copied?: string }).__copied,
      ),
    )
    .toBe(MEET_URL);

  await page.setViewportSize({ width: 1440, height: 960 });
  const meetLink = form.getByRole("link", { name: "Google Meet" });
  await meetLink.scrollIntoViewIfNeeded();
  await expect(meetLink).toBeInViewport();
  await expect(
    meetCopy.locator("xpath=..").getByTestId("l-icon"),
  ).toBeInViewport();

  const sidebar = page.locator("#sidebar");
  await sidebar.screenshot({
    path: test.info().outputPath("event-form-meeting-link-keycaps.png"),
  });

  await sidebar.screenshot({
    path: testInfo.outputPath("event-form-meeting-link-keycaps.png"),
  });
});
