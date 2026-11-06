import type React from "react";

const KEYBOARD_SELECTED_DAY_SELECTOR =
  ".react-datepicker__day--keyboard-selected:not(.react-datepicker__day--disabled)";

/** Padding around the cell so focus ring / outline stays inside scroll parents. */
const FOCUS_REVEAL_PAD_PX = 4;

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
/** Grid Life/EventForm: also align focused day in `.c-date-picker` (inner shell). */
function revealInGridCalendarShell(el: HTMLElement, pad: number) {
  const shell = el.closest(".c-date-picker.calendar.calendar--open");
  if (
    !(shell instanceof HTMLElement) ||
    !shell.closest(".c-date-picker-popper-grid.react-datepicker-popper")
  ) {
    return;
  }

  for (let i = 0; i < 64; i++) {
    const er = el.getBoundingClientRect();
    const hr = shell.getBoundingClientRect();
    const prev = shell.scrollTop;
    if (er.bottom + pad > hr.bottom) {
      shell.scrollTop += er.bottom + pad - hr.bottom;
    } else if (er.top - pad < hr.top) {
      shell.scrollTop += er.top - pad - hr.top;
    } else {
      break;
    }
    if (Math.abs(shell.scrollTop - prev) < 0.5) break;
  }
}

/** Grid popper node is the overflow host; always scroll by viewport rects (see e2e scrollport). */
function revealInGridPopperShell(
  popper: HTMLElement,
  el: HTMLElement,
  pad: number,
) {
  if (!popper.classList.contains("c-date-picker-popper-grid")) return;

  for (let i = 0; i < 64; i++) {
    const er = el.getBoundingClientRect();
    const hr = popper.getBoundingClientRect();
    const prev = popper.scrollTop;
    if (er.bottom + pad > hr.bottom) {
      popper.scrollTop += er.bottom + pad - hr.bottom;
    } else if (er.top - pad < hr.top) {
      popper.scrollTop += er.top - pad - hr.top;
    } else {
      break;
    }
    if (Math.abs(popper.scrollTop - prev) < 0.5) break;
  }
}

function revealInScrollHost(host: HTMLElement, el: HTMLElement, pad: number) {
  for (let i = 0; i < 64; i++) {
    const canY = isScrollableOverflowY(host);
    const canX = isScrollableOverflowX(host);
    if (!canY && !canX) return;

    const er = el.getBoundingClientRect();
    const hr = host.getBoundingClientRect();

    let moved = false;
    if (canY) {
      if (er.bottom + pad > hr.bottom) {
        const delta = er.bottom + pad - hr.bottom;
        host.scrollTop += delta;
        moved = true;
      } else if (er.top - pad < hr.top) {
        const delta = er.top - pad - hr.top;
        host.scrollTop += delta;
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
 * After `focus({ preventScroll: true })`, scroll overflow ancestors (popper first)
 * so the focused day is visible. Does not scroll the document root.
 */
function scrollKeyboardSelectedDayIntoCalendarScope(day: HTMLElement) {
  const pad = FOCUS_REVEAL_PAD_PX;
  /** Week row rect matches the visual grid row; a lone day can sit "in view" while the row clips. */
  const revealEl =
    (day.closest(".react-datepicker__week") as HTMLElement | null) ?? day;

  const popper = day.closest(".react-datepicker-popper");
  if (
    popper instanceof HTMLElement &&
    popper.classList.contains("c-date-picker-popper-grid")
  ) {
    // `preventScroll` focus skips native scrolling; `nearest` scrolls overflow
    // ancestors (the grid popper) without chaining to the document.
    revealEl.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  revealInGridCalendarShell(day, pad);

  if (popper instanceof HTMLElement) {
    revealInGridPopperShell(popper, revealEl, pad);
    revealInScrollHost(popper, revealEl, pad);
  }

  const calendarShell = day.closest(".c-date-picker");
  if (calendarShell instanceof HTMLElement) {
    revealInScrollHost(calendarShell, revealEl, pad);
  }

  const scopeRoot = (popper ?? day.closest(".calendar")) as HTMLElement | null;
  if (!scopeRoot) return;

  for (
    let n: HTMLElement | null = day.parentElement;
    n && n !== scopeRoot;
    n = n.parentElement
  ) {
    revealInScrollHost(n, revealEl, pad);
  }
}

/** Keys the field acts on itself never reach the form or Life page shortcuts. */
export function consumeDatePickerKey(event: React.KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function findKeyboardSelectedDay(calendarClassName?: string) {
  return (
    document.querySelector<HTMLElement>(
      `.react-datepicker-popper ${KEYBOARD_SELECTED_DAY_SELECTOR}`,
    ) ??
    (calendarClassName
      ? document.querySelector<HTMLElement>(
          `.calendar.${calendarClassName} ${KEYBOARD_SELECTED_DAY_SELECTOR}`,
        )
      : null)
  );
}

export function focusKeyboardSelectedDay(calendarClassName?: string) {
  const run = () => {
    const day = findKeyboardSelectedDay(calendarClassName);
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

    const inGridPopper = Boolean(
      day.closest(".c-date-picker-popper-grid.react-datepicker-popper"),
    );
    if (!inGridPopper) {
      const sx = window.scrollX;
      const sy = window.scrollY;
      day.scrollIntoView({ block: "nearest", inline: "nearest" });
      window.scrollTo(sx, sy);
    }
  };
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
}
