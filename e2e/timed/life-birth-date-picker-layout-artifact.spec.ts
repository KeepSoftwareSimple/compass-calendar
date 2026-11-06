import { expect, test } from "@playwright/test";

const ARTIFACT_PREFIX = "/opt/cursor/artifacts/life-birth-date-picker";

const OUTLINE_PAD_PX = 6;

/** react-datepicker v4: `Choose ` + date-fns `PPPP` in the active locale. */
const SEPT_26_1993_LABEL = "Choose Sunday, September 26th, 1993";
const SEPT_14_1993_LABEL = "Choose Tuesday, September 14th, 1993";

/** September 1993: from Tue 14 to Sun 26 in a Sunday-first grid is ↓↓←←. */
async function keyboardNavigateToSeptember261993(
  page: import("@playwright/test").Page,
) {
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
}

/**
 * Month navigation clicks move focus to the caption control. Put keyboard focus
 * back on the typed cursor day by exact react-datepicker `aria-label` before
 * exercising grid arrow keys.
 */
async function focusLifeBirthDayByExactAriaLabel(
  page: import("@playwright/test").Page,
  label: string,
) {
  await page.evaluate((l) => {
    const popper = document.querySelector(
      ".react-datepicker-popper:has(.lifeBirthDatePicker)",
    );
    if (!(popper instanceof HTMLElement)) {
      throw new Error("Life birth date picker popper not found");
    }
    const el = Array.from(popper.querySelectorAll<HTMLElement>("*")).find(
      (n) => n.getAttribute("aria-label") === l,
    );
    if (!el) {
      throw new Error(`No cell with aria-label: ${l}`);
    }
    el.focus({ preventScroll: true });
  }, label);
}

async function assertFocusedSept261993FullyVisible(
  page: import("@playwright/test").Page,
) {
  await expect
    .poll(
      async () => {
        const r = await page.evaluate(
          ({ outlinePad, expectedLabel }) => {
            const vpW = window.innerWidth;
            const vpH = window.innerHeight;
            const scrollYBefore = window.scrollY;

            const active = document.activeElement;
            if (!(active instanceof HTMLElement)) {
              return { ok: false as const, reason: "no activeElement" };
            }
            const isDayLike =
              active.classList.contains("react-datepicker__day") ||
              active.getAttribute("role") === "option";
            if (!isDayLike) {
              return { ok: false as const, reason: "focus not on day cell" };
            }
            const popper = active.closest(".react-datepicker-popper");
            if (!(popper instanceof HTMLElement)) {
              return {
                ok: false as const,
                reason: "no popper for focused day",
              };
            }
            if (!popper.contains(active)) {
              return {
                ok: false as const,
                reason: "focused day outside popper",
              };
            }
            if (!popper.querySelector(".lifeBirthDatePicker")) {
              return {
                ok: false as const,
                reason: "popper is not the Life birth date picker",
              };
            }

            const label = active.getAttribute("aria-label") ?? "";
            if (label !== expectedLabel) {
              return {
                ok: false as const,
                reason: `expected aria-label ${expectedLabel}, got: ${label}`,
              };
            }

            const gridPopper = popper.closest(
              ".c-date-picker-popper-grid.react-datepicker-popper",
            );
            const scrollport =
              gridPopper instanceof HTMLElement
                ? gridPopper
                : ((popper.querySelector(
                    ".c-date-picker.calendar--open",
                  ) as HTMLElement) ?? (popper as HTMLElement));
            const sr = scrollport.getBoundingClientRect();

            const pad = outlinePad;

            const checkVisibleInPopperAndViewport = (
              el: Element,
              name: string,
            ) => {
              const b = el.getBoundingClientRect();
              const outline = 3;
              const expanded = {
                top: b.top - outline,
                bottom: b.bottom + outline,
                left: b.left - outline,
                right: b.right + outline,
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

            const row = active.closest(".react-datepicker__week");
            if (!(row instanceof HTMLElement)) {
              return {
                ok: false as const,
                reason: "no week row for focused day",
              };
            }

            for (const [el, name] of [
              [row, "week row with Sept 26"],
              [active, "Sept 26 focus target"],
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
          },
          { outlinePad: OUTLINE_PAD_PX, expectedLabel: SEPT_26_1993_LABEL },
        );
        return r;
      },
      {
        timeout: 8_000,
        message:
          "Sept 26 1993 must be focused, exact label, visible in grid scrollport and viewport (no document scroll)",
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
    localStorage.setItem(
      "compass.life.preferences",
      JSON.stringify({
        birthDate: "",
        lifespan: 79,
        variation: "average",
      }),
    );
  });

  /** Shortcuts stay mounted; when closed the dialog is `inert` and pointer-events none. */
  const dismissShortcutsDialogIfOpen = async () => {
    const shortcutsDialog = page.getByRole("dialog", {
      name: "Keyboard shortcuts",
    });
    const open = await shortcutsDialog
      .evaluate((el) => !(el as HTMLElement).inert)
      .catch(() => false);
    if (open) {
      await shortcutsDialog
        .getByRole("button", { name: "Close shortcuts" })
        .click();
      await expect
        .poll(async () =>
          shortcutsDialog.evaluate((el) => (el as HTMLElement).inert),
        )
        .toBe(true);
    }
  };

  /**
   * Only the Life birth field uses `calendarClassName="lifeBirthDatePicker"`.
   * The popper portals to `document`, so do not scope under the sidebar subtree.
   */
  const lifeBirthGridPopper = () =>
    page.locator(".react-datepicker-popper:has(.lifeBirthDatePicker)");

  const syncPickerCaptionToSeptember1993 = async () => {
    await dismissShortcutsDialogIfOpen();

    const popper = lifeBirthGridPopper();
    await expect(popper).toBeVisible();

    const caption = popper.getByRole("button", {
      name: "Choose month and year",
    });
    const prevMonth = popper.getByRole("button", { name: "Previous month" });

    for (let i = 0; i < 420; i++) {
      if ((await caption.textContent())?.trim() === "Sep 1993") break;
      await prevMonth.click();
    }

    await expect(caption).toHaveText("Sep 1993");

    await expect(
      popper.getByRole("listbox", { name: /1993-09/ }),
    ).toBeVisible();
  };

  /** Nudges such as trial timers render in a status region with a Dismiss control. */
  const dismissBlockingStatusNudges = async () => {
    const dismissBtns = page.getByRole("status").getByRole("button", {
      name: "Dismiss",
    });
    const n = await dismissBtns.count();
    for (let i = 0; i < n; i++) {
      const b = dismissBtns.nth(i);
      if (await b.isVisible().catch(() => false)) {
        await b.click();
      }
    }
  };

  const openPickerSeptember1993 = async () => {
    await page.goto("/life", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();

    const openSidebar = page.getByRole("button", { name: "Open sidebar" });
    if (await openSidebar.isVisible()) {
      await openSidebar.click();
    }

    await dismissShortcutsDialogIfOpen();
    await dismissBlockingStatusNudges();

    const birth = page.getByRole("textbox", { name: "Date of birth" });
    // `click()` runs `onInputClick` and opens the calendar before typing. The
    // grid then stays on "today" until navigation. `focus()` matches a keyboard
    // path that types first, then opens with ArrowDown.
    await birth.focus();
    // `DatePicker` uses month-first parsing; ISO `1993-09-14` does not type
    // reliably into the formatted field. US-style month/day/year matches the
    // same committed date as the product preview (`MMM d, yyyy`).
    await birth.pressSequentially("9/14/1993");
    await birth.press("ArrowDown");

    await expect(page.locator(".lifeBirthDatePicker")).toBeVisible();
    await expect(
      page.getByTestId("life-birth-date-calendar-hint"),
    ).toBeVisible();

    await syncPickerCaptionToSeptember1993();
    await focusLifeBirthDayByExactAriaLabel(page, SEPT_14_1993_LABEL);

    const popper = lifeBirthGridPopper();
    await expect(
      popper.getByRole("option", { name: SEPT_14_1993_LABEL, exact: true }),
    ).toBeVisible();
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

    await syncPickerCaptionToSeptember1993();
    await focusLifeBirthDayByExactAriaLabel(page, SEPT_14_1993_LABEL);

    const popper = lifeBirthGridPopper();
    await expect(popper).toBeVisible();
    await dismissShortcutsDialogIfOpen();

    await expect
      .poll(() =>
        page.evaluate(
          (label) =>
            document.activeElement?.getAttribute("aria-label") === label,
          SEPT_14_1993_LABEL,
        ),
      )
      .toBe(true);

    await keyboardNavigateToSeptember261993(page);

    await assertFocusedSept261993FullyVisible(page);

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
