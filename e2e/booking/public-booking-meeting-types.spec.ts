import { expect, type Page, test } from "@playwright/test";
import {
  buildBookableSlot,
  formatSlotButtonLabel,
  preparePublicBookingPage,
} from "./booking-harness";

const MEETING_TYPES = [
  { id: "default", label: "Intro call", durationMinutes: 30 },
  { id: "type-deep", label: "Deep dive", durationMinutes: 60 },
  { id: "type-quick", label: "Check-in", durationMinutes: 15 },
];

const typeButton = (page: Page, label: string) =>
  page.getByRole("button", { name: new RegExp(`^${label}`) });

/**
 * Samples the top of "Pick a time" and the picker on every animation frame,
 * so a shift that lasts one frame still shows up.
 */
const trackPickerTops = (page: Page) =>
  page.evaluate(() => {
    const w = window as Window & { __pickerTops?: Record<string, number[]> };
    const tops: Record<string, number[]> = { heading: [], picker: [] };
    w.__pickerTops = tops;
    const record = (key: string, el: Element | null | undefined) => {
      if (!el) return;
      const top = Math.round(el.getBoundingClientRect().top);
      const seen = tops[key]!;
      if (seen.at(-1) !== top) seen.push(top);
    };
    const tick = () => {
      record(
        "heading",
        Array.from(document.querySelectorAll("h2")).find(
          (el) => el.textContent?.trim() === "Pick a time",
        ),
      );
      record("picker", document.querySelector("[data-meeting-type]"));
      requestAnimationFrame(tick);
    };
    tick();
  });

const readPickerTops = (page: Page) =>
  page.evaluate(
    () =>
      (window as Window & { __pickerTops?: Record<string, number[]> })
        .__pickerTops ?? {},
  );

test.describe("public booking meeting types", () => {
  test("a page with one type shows no type picker", async ({ page }) => {
    await preparePublicBookingPage(page);
    await expect(page.getByText("Pick a meeting")).toHaveCount(0);
    await expect(page.locator("[data-meeting-type]")).toHaveCount(0);
  });

  test("1, 2 and 3 switch types without moving the picker", async ({
    page,
  }) => {
    const captured = await preparePublicBookingPage(page, {
      meetingTypes: MEETING_TYPES,
    });
    await expect(typeButton(page, "Intro call")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await trackPickerTops(page);

    await page.keyboard.press("2");
    await expect(typeButton(page, "Deep dive")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page).toHaveURL(/[?&]type=type-deep/);
    await expect(
      page.getByText("1 hour", { exact: false }).first(),
    ).toBeVisible();
    await expect
      .poll(() =>
        captured.slotQueries.some((q) => q.meetingTypeId === "type-deep"),
      )
      .toBe(true);

    await page.keyboard.press("3");
    await expect(typeButton(page, "Check-in")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.keyboard.press("1");
    await expect(typeButton(page, "Intro call")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Type #1 is the plain page link.
    await expect(page).not.toHaveURL(/[?&]type=/);
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();

    const tops = await readPickerTops(page);
    expect(tops.heading, `heading tops ${tops.heading}`).toHaveLength(1);
    expect(tops.picker, `picker tops ${tops.picker}`).toHaveLength(1);
  });

  test("a ?type= link opens that type", async ({ page }) => {
    const captured = await preparePublicBookingPage(page, {
      meetingTypes: MEETING_TYPES,
      search: "?type=type-quick",
    });
    await expect(typeButton(page, "Check-in")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      captured.slotQueries.every((q) => q.meetingTypeId === "type-quick"),
    ).toBe(true);
  });

  test("an unknown ?type= falls back to the first type", async ({ page }) => {
    await preparePublicBookingPage(page, {
      meetingTypes: MEETING_TYPES,
      search: "?type=gone",
    });
    await expect(typeButton(page, "Intro call")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("booking sends the picked type and its length", async ({ page }) => {
    const slot = buildBookableSlot(60);
    const captured = await preparePublicBookingPage(page, {
      meetingTypes: MEETING_TYPES,
      search: "?type=type-deep",
      slots: [slot],
    });
    await page
      .getByRole("button", { name: formatSlotButtonLabel(slot.slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    await expect.poll(() => captured.reservationPosts.length).toBe(1);
    expect(captured.reservationPosts[0]).toMatchObject({
      durationMinutes: 60,
      meetingTypeId: "type-deep",
    });
  });
});
