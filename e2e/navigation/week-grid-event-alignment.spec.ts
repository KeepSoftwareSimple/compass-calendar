import { expect, test } from "@playwright/test";
import { prepareCalendarPage } from "../utils/event-test-utils";
import { seedLocalEvents } from "../utils/local-event-seed.util";
import { evaluateWeekGridEventAlignment } from "../utils/week-grid-alignment.util";

const DENVER = "America/Denver";
/** Week without a Denver 25-hour day (Nov 1 fall-back breaks label indexOf). */
const WEEK_START = "2026-10-18";
/** 12:25 PM MDT on a day in this week (matches production repro). */
const FROZEN_CLOCK = "2026-10-21T12:25:00-06:00";
const FROZEN_NOW_MINUTES = 12 * 60 + 25;
const PROBE_TITLE = "Alignment probe";

const alignmentOnboardingInitScript = () => {
  localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
  localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
  localStorage.setItem("compass.view.sidebar-open", "false");
};

async function seedAlignmentProbe(page: import("@playwright/test").Page) {
  await seedLocalEvents(page, [
    {
      id: `05${"a".repeat(22)}`,
      content: { kind: "details", title: PROBE_TITLE, description: "" },
      schedule: {
        kind: "timed",
        start: "2026-10-22T16:00:00.000Z",
        end: "2026-10-22T16:45:00.000Z",
        timeZone: DENVER,
      },
      createdAt: "2026-11-01T00:00:00.000Z",
    },
  ]);
}

async function waitForWeekGridLayoutReady(
  page: import("@playwright/test").Page,
) {
  await page.locator("#mainGrid").waitFor({ state: "visible" });
  await page
    .locator('[data-calendar-timed-grid-row="true"]')
    .first()
    .waitFor({ state: "visible" });
}

async function seedAndShowAlignmentProbe(
  page: import("@playwright/test").Page,
) {
  await seedAlignmentProbe(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForWeekGridLayoutReady(page);
  const probe = page
    .locator("#timedEvents")
    .getByRole("button", { name: PROBE_TITLE });
  await expect(probe).toBeVisible({ timeout: 15_000 });
}

async function prepareAlignmentWeekContext(
  page: import("@playwright/test").Page,
) {
  await page.addInitScript(alignmentOnboardingInitScript);
  await page.clock.install({ time: new Date(FROZEN_CLOCK) });
  await prepareCalendarPage(page);
}

async function openAlignmentWeek(page: import("@playwright/test").Page) {
  await prepareAlignmentWeekContext(page);
  await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
  await waitForWeekGridLayoutReady(page);
  await seedAndShowAlignmentProbe(page);
}

test.describe("Week grid event alignment", () => {
  test.use({
    timezoneId: DENVER,
    viewport: { width: 1280, height: 900 },
  });

  test("lines timed events up with gutter hour rows and day columns", async ({
    page,
  }) => {
    await openAlignmentWeek(page);

    const alignment = await evaluateWeekGridEventAlignment(
      page,
      /Alignment probe/i,
      "10 AM",
      { expectNowLineMinutes: FROZEN_NOW_MINUTES },
    );
    expect(alignment.ok, JSON.stringify(alignment)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("week-grid-gutter-alignment-fixed.png"),
      fullPage: false,
    });
  });

  test("stays aligned after life view then week with blog utm params", async ({
    page,
  }) => {
    await prepareAlignmentWeekContext(page);
    await page.goto("/life", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Life", exact: true }),
    ).toBeVisible();

    await page.goto(
      "/week?utm_source=blog&utm_medium=cta&utm_campaign=try_app&utm_content=star_button",
      { waitUntil: "domcontentloaded" },
    );
    await waitForWeekGridLayoutReady(page);
    await seedAndShowAlignmentProbe(page);

    const alignment = await evaluateWeekGridEventAlignment(
      page,
      /Alignment probe/i,
      "10 AM",
      { expectNowLineMinutes: FROZEN_NOW_MINUTES },
    );
    expect(alignment.ok, JSON.stringify(alignment)).toBe(true);
  });
});
