import { expect, type Page, test } from "@playwright/test";
import { getVisibleDayDates } from "../utils/event-test-utils";

// The week view drops days instead of squishing or scrolling them. Expected
// counts mirror computeVisibleDayCount in
// packages/web/src/views/Week/util/week-window.util.ts:
// clamp(floor((trackWidth - 50) / 140), 1, 7).
const layoutCases = [
  // 900px: sidebar auto-collapsed (<1280), track ~868px -> 5 days
  { width: 900, expectedDays: 5 },
  // 1280px: sidebar open at its default 345px, track ~871px -> 5 days
  { width: 1280, expectedDays: 5 },
  // 1728px: sidebar open, track ~1411px -> capped at the full week
  { width: 1728, expectedDays: 7 },
];
const maxLayoutDelta = 1;
// Sidebar width animates for 200ms. Sample through that window so a late
// close (boot shell closed, React mounting open then collapsing) fails here
// instead of after an arbitrary settle wait.
const sidebarTransitionWindowMs = 400;

test.describe("Week view layout", () => {
  for (const { width, expectedDays } of layoutCases) {
    test(`aligns ${expectedDays} day headers with calendar columns at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/week");
      await page.locator("#allDayColumns").waitFor();
      await page.locator("#timedColumns").waitFor();
      // First React paint must already match the boot shell. Polling here
      // would hide the sidebar-width / column-count jump this spec exists
      // to catch.
      const firstPaintDays = await getVisibleDayDates(page);
      expect(firstPaintDays).toHaveLength(expectedDays);
      expectGeometryToHold(await sampleWeekGeometry(page), expectedDays);

      const layout = await getWeekColumnLayout(page, expectedDays);
      const mainGridScrollbarWidth = await page
        .locator("#mainGrid")
        .evaluate(
          (node) => getComputedStyle(node, "::-webkit-scrollbar").width,
        );
      const horizontalScrollState = await getHorizontalScrollState(page);

      expect(layout.allDayColumns).toHaveLength(expectedDays);
      expect(layout.dayLabels).toHaveLength(expectedDays);
      expect(layout.timedColumns).toHaveLength(expectedDays);
      expect(mainGridScrollbarWidth).toBe("0px");
      expect(horizontalScrollState.scrollbarHeight).toBe("0px");
      // The visible days always fit, so the grid never scrolls horizontally
      expect(horizontalScrollState.isScrollable).toBe(false);

      for (const [index, dayLabel] of layout.dayLabels.entries()) {
        expectColumnsToAlign(dayLabel, layout.allDayColumns[index]);
        expectColumnsToAlign(dayLabel, layout.timedColumns[index]);
      }
    });
  }

  test("shows a single day anchored on today at phone-like widths", async ({
    page,
  }) => {
    // 320px: track ~288px -> floor((288 - 50) / 140) = 1 day
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/week");
    await page.locator("#timedColumns").waitFor();
    const firstPaintDays = await getVisibleDayDates(page);
    expect(firstPaintDays).toHaveLength(1);
    expectGeometryToHold(await sampleWeekGeometry(page), 1);

    const layout = await getWeekColumnLayout(page, 1);
    expect(layout.dayLabels).toHaveLength(1);
    expect(layout.timedColumns).toHaveLength(1);

    // The one visible day is today (title is the compact YYYYMMDD day label)
    const today = new Date();
    const todayLabel = `${today.getFullYear()}${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    await expect(
      page.locator(`#weekGridScroller [title="${todayLabel}"]`),
    ).toBeVisible();
  });

  test("honors a persisted closed sidebar at 1280px without a width jump", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("compass.view.sidebar-open", "false");
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/week");
    await page.locator("#timedColumns").waitFor();

    // Closed sidebar: track ~1198px -> full week. First paint must already
    // be 7 days; mounting open and then collapsing would pass a delayed
    // assertion and fail this sample.
    expect(await getVisibleDayDates(page)).toHaveLength(7);
    await expect(
      page.getByRole("complementary", { name: "Sidebar" }),
    ).toHaveCount(0);
    expectGeometryToHold(await sampleWeekGeometry(page), 7);
  });

  test("keeps 900px geometry in dark theme and with reduced motion", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("compass.theme", "dark-abyss");
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.goto("/week");
    await page.locator("#timedColumns").waitFor();

    expect(await getVisibleDayDates(page)).toHaveLength(5);
    expectGeometryToHold(await sampleWeekGeometry(page), 5);
  });
});

const getWeekColumnLayout = async (page: Page, daysInView: number) =>
  page.evaluate((visibleDays) => {
    const roundRect = (rect: DOMRect) => ({
      right: Math.round(rect.right * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      x: Math.round(rect.x * 100) / 100,
    });

    const dayLabels = [
      ...document.querySelectorAll("#weekGridScroller [title]"),
    ]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      // Day labels use the compact YYYYMMDD format; skip e.g. the now line
      .filter((node) => /^\d{8}$/.test(node.title))
      .slice(0, visibleDays)
      .map((node) => roundRect(node.getBoundingClientRect()));

    const getColumns = (selector: string) =>
      [...document.querySelectorAll(selector)]
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
        .map((node) => {
          const rect = node.getBoundingClientRect();

          return {
            ...roundRect(rect),
            height: rect.height,
          };
        })
        .filter((rect) => rect.height > 20);

    return {
      allDayColumns: getColumns("#allDayColumns th"),
      dayLabels,
      timedColumns: getColumns("#timedColumns th"),
    };
  }, daysInView);

const getHorizontalScrollState = async (page: Page) =>
  page.locator("#weekGridScroller").evaluate((node) => {
    return {
      isScrollable: node.scrollWidth > node.clientWidth,
      scrollbarHeight: getComputedStyle(node, "::-webkit-scrollbar").height,
    };
  });

type WeekGeometrySample = {
  allDayHeight: number;
  dayCount: number;
  mainWidth: number;
};

const sampleWeekGeometry = (page: Page) =>
  page.evaluate(async (durationMs) => {
    const round = (value: number) => Math.round(value * 100) / 100;
    const read = (): WeekGeometrySample => {
      const days = [
        ...document.querySelectorAll("#weekGridScroller [title]"),
      ].filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && /^\d{8}$/.test(node.title),
      ).length;
      return {
        allDayHeight: round(
          document.getElementById("allDayRow")?.getBoundingClientRect()
            .height ?? 0,
        ),
        dayCount: days,
        mainWidth: round(
          document.getElementById("mainSection")?.getBoundingClientRect()
            .width ?? 0,
        ),
      };
    };

    const samples: WeekGeometrySample[] = [read()];
    const startedAt = performance.now();
    while (performance.now() - startedAt < durationMs) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      samples.push(read());
    }
    return samples;
  }, sidebarTransitionWindowMs);

const expectGeometryToHold = (
  samples: WeekGeometrySample[],
  expectedDays: number,
) => {
  expect(samples.length).toBeGreaterThan(1);
  expect(samples.map((sample) => sample.dayCount)).toEqual(
    Array(samples.length).fill(expectedDays),
  );

  const spread = (values: number[]) =>
    Math.max(...values) - Math.min(...values);
  expect(spread(samples.map((sample) => sample.mainWidth))).toBeLessThanOrEqual(
    maxLayoutDelta,
  );
  // Events may still arrive and grow the all-day region; it must not
  // collapse to zero while that happens.
  expect(
    Math.min(...samples.map((sample) => sample.allDayHeight)),
  ).toBeGreaterThan(0);
};

const expectColumnsToAlign = (
  dayLabel: { right: number; width: number; x: number },
  gridColumn: { right: number; width: number; x: number },
) => {
  expect(Math.abs(dayLabel.x - gridColumn.x)).toBeLessThanOrEqual(
    maxLayoutDelta,
  );
  expect(Math.abs(dayLabel.right - gridColumn.right)).toBeLessThanOrEqual(
    maxLayoutDelta,
  );
  expect(Math.abs(dayLabel.width - gridColumn.width)).toBeLessThanOrEqual(
    maxLayoutDelta,
  );
};
