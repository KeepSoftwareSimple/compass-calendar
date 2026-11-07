import { format } from "date-fns";
import type React from "react";

const KEYBOARD_SELECTED_DAY_SELECTOR =
  ".react-datepicker__day--keyboard-selected:not(.react-datepicker__day--disabled)";

/** Padding around the cell so focus ring / outline stays inside scroll parents. */
const FOCUS_REVEAL_PAD_PX = 4;

const GRID_POPPER_SELECTOR =
  ".c-date-picker-popper-grid.react-datepicker-popper";

function isScrollableOverflowY(host: HTMLElement): boolean {
  const oy = getComputedStyle(host).overflowY;
  return (
    (oy === "auto" || oy === "scroll" || oy === "overlay") &&
    host.scrollHeight > host.clientHeight + 1
  );
}

function isScrollableOverflowX(host: HTMLElement): boolean {
  const ox = getComputedStyle(host).overflowX;
  return (
    (ox === "auto" || ox === "scroll" || ox === "overlay") &&
    host.scrollWidth > host.clientWidth + 1
  );
}

/**
 * Scroll `host` so `el` is visible inside it, using viewport rects (works when
 * `host` is the scroll container for clipped content).
 */
function padRevealInScrollHost(
  host: HTMLElement,
  el: HTMLElement,
  pad: number,
) {
  for (let i = 0; i < 8; i++) {
    const canY = isScrollableOverflowY(host);
    const canX = isScrollableOverflowX(host);
    if (!canY && !canX) return;

    const er = el.getBoundingClientRect();
    const hr = host.getBoundingClientRect();

    let moved = false;
    if (canY) {
      if (er.bottom + pad > hr.bottom) {
        host.scrollTop += er.bottom + pad - hr.bottom;
        moved = true;
      } else if (er.top - pad < hr.top) {
        host.scrollTop += er.top - pad - hr.top;
        moved = true;
      }
    }
    if (canX) {
      if (er.right + pad > hr.right) {
        host.scrollLeft += er.right + pad - hr.right;
        moved = true;
      } else if (er.left - pad < hr.left) {
        host.scrollLeft += er.left - pad - hr.left;
        moved = true;
      }
    }
    if (!moved) return;
  }
}

/**
 * After `focus({ preventScroll: true })`, scroll overflow ancestors inside the
 * calendar so the focused day is visible. Does not scroll the document root.
 *
 * Grid poppers: CSS makes `.c-date-picker-popper-grid` the vertical scroll host
 * (see `index.css`). A single pass over scrollable ancestors is enough; the
 * week row is the reveal target so the whole row stays visible.
 */
function scrollKeyboardSelectedDayIntoCalendarScope(day: HTMLElement) {
  const pad = FOCUS_REVEAL_PAD_PX;
  const revealEl =
    (day.closest(".react-datepicker__week") as HTMLElement | null) ?? day;

  const gridPopper = day.closest(GRID_POPPER_SELECTOR);
  if (gridPopper instanceof HTMLElement) {
    padRevealInScrollHost(gridPopper, revealEl, pad);
    return;
  }

  const scopeRoot = (day.closest(".react-datepicker") ??
    day.closest(".calendar")) as HTMLElement | null;
  if (!scopeRoot) return;

  for (
    let n: HTMLElement | null = day.parentElement;
    n && scopeRoot.contains(n);
    n = n.parentElement
  ) {
    padRevealInScrollHost(n, revealEl, pad);
  }

  const sx = window.scrollX;
  const sy = window.scrollY;
  revealEl.scrollIntoView({ block: "nearest", inline: "nearest" });
  window.scrollTo(sx, sy);
}

/** Keys the field acts on itself never reach the form or Life page shortcuts. */
export function consumeDatePickerKey(event: React.KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

/** Matches react-datepicker v4 + date-fns `PPPP` on each day cell (`Choose Tuesday, …`). */
function expectedDayAriaLabel(cursorDate: Date): string {
  return `Choose ${format(cursorDate, "PPPP")}`;
}

/**
 * Roots to search for keyboard-selected cells. Without `calendarClassName`,
 * only portaled poppers are scanned (never a lone inline `.calendar`), matching
 * legacy callers that used `document.querySelector('.react-datepicker-popper …')`.
 */
function forEachSearchRoot(
  calendarClassName: string | undefined,
  visit: (root: ParentNode) => void,
) {
  if (calendarClassName) {
    document
      .querySelectorAll<HTMLElement>(
        `.react-datepicker-popper .calendar.${calendarClassName}, .calendar.${calendarClassName}`,
      )
      .forEach((el) => visit(el));
    return;
  }
  document
    .querySelectorAll<HTMLElement>(".react-datepicker-popper")
    .forEach((el) => visit(el));
}

export function findKeyboardSelectedDay(
  calendarClassName?: string,
  cursorDate?: Date | null,
): HTMLElement | null {
  const label = cursorDate != null ? expectedDayAriaLabel(cursorDate) : null;

  let fallback: HTMLElement | null = null;
  let exact: HTMLElement | null = null;

  forEachSearchRoot(calendarClassName, (root) => {
    for (const el of root.querySelectorAll<HTMLElement>(
      KEYBOARD_SELECTED_DAY_SELECTOR,
    )) {
      if (!fallback) fallback = el;
      if (label !== null && el.getAttribute("aria-label") === label) {
        exact = el;
      }
    }
  });

  if (label !== null) {
    return exact;
  }

  return fallback;
}

export function focusKeyboardSelectedDay(
  calendarClassName?: string,
  cursorDate?: Date | null,
) {
  const run = () => {
    const day = findKeyboardSelectedDay(calendarClassName, cursorDate);
    if (!day) return;
    const scope = day.closest(".react-datepicker") ?? day.closest(".calendar");
    scope
      ?.querySelectorAll<HTMLElement>(".react-datepicker__day[tabindex]")
      .forEach((element) => {
        element.tabIndex = -1;
      });
    day.tabIndex = 0;
    day.focus({ preventScroll: true });
    scrollKeyboardSelectedDayIntoCalendarScope(day);
  };
  requestAnimationFrame(run);
}
