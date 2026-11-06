import { expect, test } from "@playwright/test";

const ARTIFACT_PREFIX = "/opt/cursor/artifacts/life-birth-date-picker";

/** September 1993 has 6 week rows; last in-grid Sunday is 26. */
const assertCalendarFullyInViewport = async (
  page: import("@playwright/test").Page,
) => {
  const result = await page.evaluate(() => {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const popper = document.querySelector(".react-datepicker-popper");
    if (!popper) {
      return {
        ok: false,
        reason: "no popper",
      };
    }

    const weeks = [...popper.querySelectorAll(".react-datepicker__week")];
    const lastWeek = weeks.at(-1) as HTMLElement | undefined;
    if (!lastWeek) {
      return { ok: false, reason: "no week rows" };
    }

    const dayCells = [...popper.querySelectorAll(".react-datepicker__day")];
    const day26 = dayCells.find((c) => c.textContent?.trim() === "26");
    if (!day26) {
      return { ok: false, reason: "day 26 not in DOM" };
    }

    const keyboardCursor = popper.querySelector(
      ".react-datepicker__day--keyboard-selected:not(.react-datepicker__day--selected)",
    ) as HTMLElement | null;
    if (!keyboardCursor) {
      return { ok: false, reason: "no keyboard cursor" };
    }

    const findScrollHost = (start: HTMLElement): HTMLElement => {
      let node: HTMLElement | null = start;
      while (node && node !== document.body) {
        if (node.scrollHeight > node.clientHeight + 1) {
          return node;
        }
        node = node.parentElement;
      }
      return document.documentElement;
    };

    const scrollHost = findScrollHost(lastWeek);
    scrollHost.scrollTop = scrollHost.scrollHeight;

    for (const el of [lastWeek, day26, keyboardCursor]) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    const pad = 6;

    const check = (el: Element, name: string) => {
      const r = el.getBoundingClientRect();
      const outline = 3;
      const bottom = r.bottom + outline;
      const top = r.top - outline;
      const left = r.left - outline;
      const right = r.right + outline;
      if (top < -pad) return `${name} top ${top} < 0`;
      if (left < -pad) return `${name} left ${left} < 0`;
      if (bottom > vpH + pad) return `${name} bottom ${bottom} > ${vpH}`;
      if (right > vpW + pad) return `${name} right ${right} > ${vpW}`;
      return null;
    };

    for (const [el, name] of [
      [lastWeek, "last week row"],
      [day26, "day 26"],
      [keyboardCursor, "keyboard cursor"],
    ] as const) {
      const err = check(el, name);
      if (err) return { ok: false, reason: err, vpW, vpH };
    }

    return { ok: true, vpW, vpH };
  });

  expect(
    result.ok,
    result.ok
      ? ""
      : `viewport check failed: ${(result as { reason: string }).reason}`,
  ).toBe(true);
};

test("artifact: life birth date picker layout and grid not clipped", {
  tag: "@artifact",
}, async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
    localStorage.setItem("compass.view.sidebar-open", "true");
  });

  const runCapture = async (suffix: string) => {
    await page.goto("/life", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();

    const openSidebar = page.getByRole("button", { name: "Open sidebar" });
    if (await openSidebar.isVisible()) {
      await openSidebar.click();
    }

    const birth = page.getByRole("textbox", { name: "Date of birth" });
    await birth.click();
    await birth.fill("1993-09-14");
    await birth.press("ArrowDown");

    await expect(page.locator(".lifeBirthDatePicker")).toBeVisible();
    await expect(
      page.getByTestId("life-birth-date-calendar-hint"),
    ).toBeVisible();
    await expect(page.getByText("Sep 1993")).toBeVisible();

    await assertCalendarFullyInViewport(page);

    await page.screenshot({
      path: `${ARTIFACT_PREFIX}-${suffix}.png`,
      fullPage: false,
    });
  };

  await page.setViewportSize({ width: 420, height: 520 });
  await runCapture("normal");

  await page.setViewportSize({ width: 360, height: 320 });
  await runCapture("constrained-height");
});
