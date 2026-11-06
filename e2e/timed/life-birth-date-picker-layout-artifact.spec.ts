import { expect, test } from "@playwright/test";

const ARTIFACT_PREFIX = "/opt/cursor/artifacts/life-birth-date-picker";

const OUTLINE_PAD_PX = 6;

/** September 1993: from Tue 14 to Sun 26 is ↓↓←← (two weeks down, two days left). */
async function keyboardNavigateToBottomRowSeptember1993(
  page: import("@playwright/test").Page,
) {
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
}

/** September 1993: assert the week row that contains Sun 26 (not the grid’s last row, which can be spillover). */
async function assertCalendarFullyInViewport(
  page: import("@playwright/test").Page,
) {
  await expect
    .poll(
      async () => {
        const r = await page.evaluate((outlinePad) => {
          const vpW = window.innerWidth;
          const vpH = window.innerHeight;
          const scrollYBefore = window.scrollY;
          const popper = document.querySelector(".react-datepicker-popper");
          if (!popper) {
            return {
              ok: false as const,
              reason: "no popper",
            };
          }

          const dayCells = [
            ...popper.querySelectorAll(".react-datepicker__day"),
          ];
          const day26 = dayCells.find((c) => {
            const label = c.getAttribute("aria-label") ?? "";
            return label.includes("September") && label.includes(" 26th,");
          });
          if (!day26) {
            return { ok: false as const, reason: "September 26 not in DOM" };
          }

          const bottomSeptemberWeek = day26.closest(".react-datepicker__week");
          if (!(bottomSeptemberWeek instanceof HTMLElement)) {
            return {
              ok: false as const,
              reason: "no week row for September 26",
            };
          }

          // Grid: the Popper node (`.c-date-picker-popper-grid`) is the overflow
          // host; the inner `.c-date-picker` can be taller and is not the
          // scrollport after max-height is capped on the popper.
          const scrollport =
            popper instanceof HTMLElement &&
            popper.classList.contains("c-date-picker-popper-grid")
              ? popper
              : ((popper.querySelector(
                  ".c-date-picker.calendar--open",
                ) as HTMLElement) ?? (popper as HTMLElement));
          const sr = scrollport.getBoundingClientRect();

          const keyboardCursor = document.activeElement;
          if (
            !(keyboardCursor instanceof HTMLElement) ||
            !keyboardCursor.classList.contains("react-datepicker__day") ||
            !popper.contains(keyboardCursor)
          ) {
            return {
              ok: false as const,
              reason: "keyboard focus not on a day in popper",
            };
          }

          const pad = outlinePad;

          const checkVisibleInPopperAndViewport = (
            el: Element,
            name: string,
          ) => {
            const r = el.getBoundingClientRect();
            const outline = 3;
            const expanded = {
              top: r.top - outline,
              bottom: r.bottom + outline,
              left: r.left - outline,
              right: r.right + outline,
            };
            const visTop = Math.max(expanded.top, sr.top, 0);
            const visBottom = Math.min(expanded.bottom, sr.bottom, vpH);
            const visLeft = Math.max(expanded.left, sr.left, 0);
            const visRight = Math.min(expanded.right, sr.right, vpW);
            if (visTop > visBottom + pad)
              return `${name} not visible vertically in popper/viewport (vis ${visTop}..${visBottom})`;
            if (visLeft > visRight + pad)
              return `${name} not visible horizontally in popper/viewport (vis ${visLeft}..${visRight})`;
            return null;
          };

          for (const [el, name] of [
            [bottomSeptemberWeek, "September week with 26"],
            [day26, "day 26"],
            [keyboardCursor, "keyboard cursor"],
          ] as const) {
            const err = checkVisibleInPopperAndViewport(el, name);
            if (err) return { ok: false as const, reason: err, vpW, vpH };
          }

          if (window.scrollY !== scrollYBefore) {
            return {
              ok: false as const,
              reason: `window scrolled ${scrollYBefore} -> ${window.scrollY}`,
              vpW,
              vpH,
            };
          }

          return { ok: true as const, vpW, vpH };
        }, OUTLINE_PAD_PX);
        return r;
      },
      {
        timeout: 8_000,
        message:
          "calendar + focus outline must stay in scrollport and viewport after keyboard reveal",
      },
    )
    .toMatchObject({ ok: true });
}

test("artifact: life birth date picker layout and grid not clipped", {
  tag: "@artifact",
}, async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
    localStorage.setItem("compass.view.sidebar-open", "true");
  });

  const openPickerSeptember1993 = async () => {
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
  };

  const runCapture = async (suffix: string, hint: "collapsed" | "expanded") => {
    await openPickerSeptember1993();

    const hintRoot = page.getByTestId("life-birth-date-calendar-hint");
    if (hint === "expanded") {
      await hintRoot.locator("summary").click();
      await expect(
        page.getByRole("region", { name: "Full calendar keyboard shortcuts" }),
      ).toBeVisible();
    }

    const popper = page.locator(
      ".c-date-picker-popper-grid.react-datepicker-popper",
    );
    if (hint === "expanded") {
      const caption = popper.locator(
        "button[aria-label='Choose month and year']",
      );
      for (let i = 0; i < 12; i++) {
        if ((await caption.textContent())?.trim() === "Sep 1993") break;
        await popper.getByRole("button", { name: "Previous month" }).click();
      }
      await expect(caption).toHaveText("Sep 1993");

      // Expanding Keys moves focus off the grid and Popper can reflow to the next month.
      await popper
        .getByRole("option", {
          name: "Choose Tuesday, September 14th, 1993",
        })
        .focus();
    }
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.activeElement?.classList.contains("react-datepicker__day"),
        ),
      )
      .toBe(true);

    await keyboardNavigateToBottomRowSeptember1993(page);

    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.activeElement?.classList.contains("react-datepicker__day"),
        ),
      )
      .toBe(true);

    // `focusKeyboardSelectedDay` reveals in nested requestAnimationFrame frames.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );

    await assertCalendarFullyInViewport(page);

    await page.screenshot({
      path: `${ARTIFACT_PREFIX}-${suffix}.png`,
      fullPage: false,
    });
  };

  await page.setViewportSize({ width: 420, height: 520 });
  await runCapture("normal-collapsed-hint", "collapsed");
  await runCapture("normal-expanded-hint", "expanded");

  await page.setViewportSize({ width: 360, height: 320 });
  await runCapture("constrained-collapsed-hint", "collapsed");
  await runCapture("constrained-expanded-hint", "expanded");
});
