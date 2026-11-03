import { expect, test } from "@playwright/test";
import {
  dispatchDocumentKey,
  prepareTimedCalendarPage,
} from "./utils/event-test-utils";

test.describe("go-to-today now cue pulse", () => {
  test("applies now-cue pulse classes on repeated t presses at now", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1728, height: 1000 });
    await prepareTimedCalendarPage(page);

    const mainGrid = page.locator("#mainGrid");
    await expect(mainGrid).toBeVisible();

    const nowLine = mainGrid.locator(".c-now-line-rim").first();
    await nowLine.waitFor({ state: "attached" });

    await dispatchDocumentKey(page, "t");
    await page.clock.runFor(700);

    await dispatchDocumentKey(page, "t");
    await expect(nowLine).toHaveClass(/c-now-cue-pulse/);
    await expect(nowLine).toHaveCSS("animation-name", "nowCuePulse");

    await dispatchDocumentKey(page, "t");
    await expect(nowLine).toHaveClass(/c-now-cue-pulse/);

    const todayWeekday = page.getByText("Fri", { exact: true }).first();
    await expect(todayWeekday).toHaveClass(/c-now-cue-label-shimmer/);
  });
});
