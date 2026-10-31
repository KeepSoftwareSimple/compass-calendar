import {
  ID_GRID_MAIN,
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

/** Horizontal focus regions, left to right, for Day and Week. */
export type CalendarUiFocusRegion = "grid" | "sidebar" | "eventPanel";

/** Life view: grid (main) then sidebar details. */
export type LifeUiFocusRegion = "grid" | "sidebar";

const EVENT_DETAILS_SELECTOR = '[aria-label="Event details"]';
const LIFE_DETAILS_SELECTOR = '[aria-label="Life details"]';

const INTERACTIVE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const isElementIn = (element: HTMLElement, selector: string): boolean =>
  Boolean(element.closest(selector));

export const detectCalendarUiFocusRegion = (): CalendarUiFocusRegion => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return "grid";

  if (isElementIn(active, EVENT_DETAILS_SELECTOR)) return "eventPanel";
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

const focusFirstLifeSidebarField = (): boolean => {
  const anchor = document.querySelector<HTMLElement>(LIFE_DETAILS_SELECTOR);
  if (!anchor) return false;
  const target =
    anchor.querySelector<HTMLElement>("#life-date-of-birth") ??
    anchor.querySelector<HTMLElement>(INTERACTIVE_SELECTOR);
  target?.focus({ preventScroll: true });
  return Boolean(target);
};

const openSidebarForFocus = (): void => {
  if (selectIsSidebarOpen(useViewStore.getState())) return;
  viewActions.setSidebarOpen(true);
};

/**
 * `u`: move keyboard focus one region left (sidebar or event panel → grid).
 */
export const moveCalendarUiFocusLeft = (
  focusGridEvent: () => void,
): boolean => {
  const region = detectCalendarUiFocusRegion();
  if (region === "sidebar" || region === "eventPanel") {
    if (restoreSidebarPickerReturnFocus()) {
      return true;
    }
    if (focusGridShell()) {
      focusGridEvent();
      return true;
    }
    focusGridEvent();
    return true;
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

  const wasOpen = selectIsSidebarOpen(useViewStore.getState());
  openSidebarForFocus();
  if (wasOpen) {
    return focusFirstSidebarItem();
  }
  requestAnimationFrame(() => focusFirstSidebarItem());
  return true;
};

export const moveLifeUiFocusLeft = (): boolean => {
  if (detectLifeUiFocusRegion() === "grid") return true;

  const gridTarget = getPageJumpFocusElement("life-grid");
  if (gridTarget) {
    gridTarget.focus({ preventScroll: true });
    return true;
  }
  return focusGridShell();
};

export const moveLifeUiFocusRight = (): boolean => {
  if (detectLifeUiFocusRegion() === "sidebar") return true;

  const wasOpen = selectIsSidebarOpen(useViewStore.getState());
  openSidebarForFocus();
  if (wasOpen) {
    return focusFirstLifeSidebarField();
  }
  requestAnimationFrame(() => focusFirstLifeSidebarField());
  return true;
};
