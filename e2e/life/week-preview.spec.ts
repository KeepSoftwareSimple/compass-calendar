import { expect, test } from "@playwright/test";
import { seedLocalEvents } from "../utils/local-event-seed.util";

test("skim a life week, zoom, open its events, and return to the same dot", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
    localStorage.setItem(
      "compass.life.preferences",
      JSON.stringify({
        birthDate: "2020-01-01",
        lifespan: 15,
        variation: "average",
      }),
    );
  });
  await page.goto("/week/2020-01-08", { waitUntil: "domcontentloaded" });
  await seedLocalEvents(page, [
    {
      id: "aabbaa112233445566778899",
      content: { kind: "details", title: "Dinner with Jo", description: "" },
      schedule: {
        kind: "timed",
        start: "2020-01-10T17:00:00.000Z",
        end: "2020-01-10T18:00:00.000Z",
        timeZone: "UTC",
      },
      createdAt: "2020-01-01T00:00:00.000Z",
    },
  ]);
  await page.goto("/life", { waitUntil: "domcontentloaded" });
  const dot = page.getByRole("button", { name: "Year 1, Week 2", exact: true });
  const preview = page.getByRole("region", { name: "Week preview" });
  await dot.hover();
  await expect(preview.getByText("Dinner with Jo")).toBeVisible();
  await dot.click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("200%", { exact: true })).toBeVisible();
  await dot.focus();
  await dot.press("ArrowRight");
  await expect(
    preview.getByText("No calendar events this week."),
  ).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(preview.getByText("Dinner with Jo")).toBeVisible();
  await preview.getByRole("button", { name: "Open week" }).click();
  await expect(page).toHaveURL(/\/week\/2020-01-08/);
  await expect(
    page.getByRole("button", { name: "Dinner with Jo" }).first(),
  ).toBeVisible();
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(dot).toBeFocused();
  await expect(preview.getByText("Dinner with Jo")).toBeVisible();
  await expect(page.getByText("200%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeDisabled();
});

test.describe("touch exploration", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("tap a week and keep it in view while zooming", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
      localStorage.setItem(
        "compass.life.preferences",
        JSON.stringify({
          birthDate: "1995-04-15",
          lifespan: 79,
          variation: "average",
        }),
      );
    });
    await page.goto("/life", { waitUntil: "domcontentloaded" });
    const dot = page.getByRole("button", {
      name: "Year 30, Week 27",
      exact: true,
    });
    await dot.tap();
    const preview = page.getByRole("region", { name: "Week preview" });
    await expect(preview.getByText("Year 30, Week 27")).toBeVisible();
    const before = await dot.boundingBox();
    await page.getByRole("button", { name: "Zoom in" }).tap();
    await expect(page.getByText("200%", { exact: true })).toBeVisible();
    const after = await dot.boundingBox();
    if (!before || !after) throw new Error("Week is outside the grid");
    expect(
      Math.abs(before.x + before.width / 2 - after.x - after.width / 2),
    ).toBeLessThan(2);
    expect(
      Math.abs(before.y + before.height / 2 - after.y - after.height / 2),
    ).toBeLessThan(2);
    const grid = page.getByRole("region", { name: /Life visualization/ });
    const marker = grid.getByText("30", { exact: true });
    await expect(marker).toHaveAttribute("title", "Year 30");
    // Pan five pixels into the second column. Its remaining edge should be
    // covered and the third week should be a complete, tappable dot.
    await grid.evaluate((element) => {
      element.scrollLeft = 25;
    });
    const edgeHits = (week: number) =>
      page
        .getByRole("button", { name: `Year 30, Week ${week}`, exact: true })
        .evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const y = rect.top + rect.height / 2;
          return [rect.left + 3, rect.right - 3].map((x) =>
            button.contains(document.elementFromPoint(x, y)),
          );
        });
    await expect.poll(() => edgeHits(2)).toEqual([false, false]);
    expect(await edgeHits(3)).toEqual([true, true]);
    const markerX = await marker.evaluate(
      (element) => element.getBoundingClientRect().right,
    );
    await grid.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect(marker).toBeInViewport();
    for (const year of [25, 30, 35]) {
      const aligned = grid.getByText(String(year), { exact: true });
      expect(
        await aligned.evaluate(
          (element) => element.getBoundingClientRect().right,
        ),
      ).toBe(markerX);
    }
    await expect(
      preview.getByRole("button", { name: "Open week" }),
    ).toBeInViewport();
  });
});
