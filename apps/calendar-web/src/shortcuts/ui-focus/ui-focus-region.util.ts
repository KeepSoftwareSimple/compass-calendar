import {
  ID_GRID_MAIN,
  ID_LIFE_BIRTH_DATE,
  ID_MAIN,
  ID_SIDEBAR,
} from "@web/common/constants/web.constants";
import { focusEventFormField } from "@web/common/utils/form/form.util";
import {
  focusFirstSidebarItem,
  restoreSidebarPickerReturnFocus,
} from "@web/components/Sidebar/util/sidebarFocus.util";
import { isEventFormOpen } from "@web/events/stores/draft.store";
import {
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { getPageJumpFocusElement } from "@web/shortcuts/page-jump/page-jump.targets";
import {
  clearUiFocusTextInsertSuppress,
  markUiFocusTextInsertSuppress,
  scheduleUiFocusInsertScrub,
  shouldSuppressUiFocusTextInsert,
  stripTrailingLetter,
} from "@web/shortcuts/ui-focus/ui-focus-text-insert.util";

/** Horizontal focus regions, left to right, for Day and Week. */
type CalendarUiFocusRegion = "grid" | "sidebar" | "eventPanel";

/** Life view: grid (main) then sidebar details. */
type LifeUiFocusRegion = "grid" | "sidebar";

const EVENT_DETAILS_SELECTOR = '[aria-label="Event details"]';
const LIFE_DETAILS_SELECTOR = '[aria-label="Life details"]';

const INTERACTIVE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const detectCalendarUiFocusRegion = (): CalendarUiFocusRegion => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return "grid";

  if (active.closest(EVENT_DETAILS_SELECTOR)) return "eventPanel";
  if (active.closest(`#${ID_SIDEBAR}`)) return "sidebar";
  if (active.closest(`#${ID_MAIN}`)) return "grid";
  return "grid";
};

export const detectLifeUiFocusRegion = (): LifeUiFocusRegion => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return "grid";

  if (active.closest(`#${ID_SIDEBAR}`)) return "sidebar";
  if (active.closest(`#${ID_MAIN}`)) return "grid";
  return "grid";
};

const focusGridShell = (): boolean => {
  const grid =
    document.getElementById(ID_GRID_MAIN) ??
    getPageJumpFocusElement("life-grid");
  if (!grid) return false;
  grid.focus({ preventScroll: true });
  return true;
};

const deferFocus = (
  target: HTMLElement | null | undefined,
  suppressInsertKey?: string,
): boolean => {
  if (!target) return false;
  if (suppressInsertKey) {
    markUiFocusTextInsertSuppress(suppressInsertKey);
  }
  const scrubInsert = () => {
    if (
      suppressInsertKey &&
      target instanceof HTMLInputElement &&
      shouldSuppressUiFocusTextInsert(suppressInsertKey)
    ) {
      stripTrailingLetter(target, suppressInsertKey);
    }
  };
  setTimeout(() => {
    target.focus({ preventScroll: true });
    scrubInsert();
    setTimeout(() => {
      scrubInsert();
      clearUiFocusTextInsertSuppress();
    }, 30);
  }, 0);
  return true;
};

const focusFirstLifeSidebarField = (): boolean => {
  const anchor = document.querySelector<HTMLElement>(LIFE_DETAILS_SELECTOR);
  if (!anchor) return false;
  const target =
    anchor.querySelector<HTMLElement>(`#${ID_LIFE_BIRTH_DATE}`) ??
    anchor.querySelector<HTMLElement>(INTERACTIVE_SELECTOR);
  scheduleUiFocusInsertScrub(ID_LIFE_BIRTH_DATE, "i");
  return deferFocus(target, "i");
};

const openSidebarForFocus = (): void => {
  if (selectIsSidebarOpen(useViewStore.getState())) return;
  viewActions.setSidebarOpen(true);
};

const focusAfterOpeningSidebar = (focus: () => boolean): boolean => {
  const wasOpen = selectIsSidebarOpen(useViewStore.getState());
  openSidebarForFocus();
  if (wasOpen) return focus();
  requestAnimationFrame(() => {
    focus();
  });
  return true;
};

/**
 * `u`: move keyboard focus one region left (sidebar or event panel → grid).
 */
export const moveCalendarUiFocusLeft = (
  focusGridEvent: () => void,
): boolean => {
  const region = detectCalendarUiFocusRegion();
  if (region === "sidebar" || region === "eventPanel") {
    if (restoreSidebarPickerReturnFocus()) return true;
    focusGridShell();
  }
  focusGridEvent();
  return true;
};

/**
 * `i`: move keyboard focus one region right (grid → sidebar month picker or
 * event panel when the form is open).
 */
export const moveCalendarUiFocusRight = (): boolean => {
  const region = detectCalendarUiFocusRegion();

  if (region === "eventPanel") return true;

  if (region === "sidebar") {
    if (isEventFormOpen()) {
      return focusEventFormField("title");
    }
    return true;
  }

  if (isEventFormOpen()) {
    openSidebarForFocus();
    return focusEventFormField("title");
  }

  return focusAfterOpeningSidebar(focusFirstSidebarItem);
};

export const moveLifeUiFocusLeft = (): boolean => {
  if (detectLifeUiFocusRegion() === "grid") return true;

  scheduleUiFocusInsertScrub(ID_LIFE_BIRTH_DATE, "u");

  const gridTarget = getPageJumpFocusElement("life-grid");
  if (gridTarget) {
    gridTarget.focus({ preventScroll: true });
    return true;
  }
  return focusGridShell();
};

export const moveLifeUiFocusRight = (): boolean => {
  if (detectLifeUiFocusRegion() === "sidebar") return true;

  markUiFocusTextInsertSuppress("i");
  return focusAfterOpeningSidebar(focusFirstLifeSidebarField);
};
