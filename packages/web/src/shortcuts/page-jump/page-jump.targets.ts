/**
 * Page-level jump targets for the hold-Mod hint gesture while no event form
 * is open: Mod+digit focuses a page area, and holding Mod alone reveals the
 * digits as chips (PageJumpHintOverlay) — the same contract as the form's
 * Mod+digit field jumps, so one habit covers both surfaces.
 *
 * Components opt in by spreading `pageJumpAttrs(id)` on their container;
 * digits come from this list's order, so it is the single place to add,
 * remove, or renumber a target. An unmounted anchor (collapsed sidebar,
 * empty Up Next) simply gets no chip and its digit does nothing. A closed
 * menu trigger (the view dropdown) or collapsed account heading is clicked
 * after focus so the jump reveals the contents instead of landing on a
 * closed control.
 *
 * Week view numbers the sidebar after the view dropdown (`buildCalendarPageJumpTargets`):
 * month picker, Up next, then one target per connected account. With no
 * accounts, a single "calendars" slot covers the list. Extra accounts that
 * would overflow the physical top-row keys are omitted.
 *
 * Day view numbers left to right (`buildDayPageJumpTargets`): view dropdown,
 * then writable calendar columns, then that same sidebar map. Extra columns
 * that would crowd out the reserved sidebar slots (month picker, Up next,
 * and each account) are omitted so those chips still appear when mounted.
 */

import { defaultCalendarGroupLabel } from "@web/auth/providers/provider-copy.util";
import { type AccountRef } from "@web/calendars/calendar.util";
import { PICK_KEY_LABELS } from "@web/shortcuts/digit-pick.util";

export const PAGE_JUMP_ATTRIBUTE = "data-page-jump";

export const DAY_COLUMN_JUMP_ID_PREFIX = "day-column:" as const;

export const CALENDAR_ACCOUNT_JUMP_ID_PREFIX = "calendar-account:" as const;

export type PageJumpTargetId =
  | "view-select"
  | "month-picker"
  | "up-next"
  | "calendars"
  | "life-grid"
  | "life-variation"
  | "life-details"
  | `${typeof DAY_COLUMN_JUMP_ID_PREFIX}${string}`
  | `${typeof CALENDAR_ACCOUNT_JUMP_ID_PREFIX}${string}`;

export type PageJumpTarget = {
  digit: string;
  id: PageJumpTargetId;
  label: string;
};

export type PageJumpTargets = readonly PageJumpTarget[];

type PageJumpTargetDraft = Omit<PageJumpTarget, "digit">;

const VIEW_SELECT_TARGET: PageJumpTargetDraft = {
  id: "view-select",
  label: "View dropdown",
};

const MONTH_PICKER_TARGET: PageJumpTargetDraft = {
  id: "month-picker",
  label: "Month picker",
};

const UP_NEXT_TARGET: PageJumpTargetDraft = {
  id: "up-next",
  label: "Up next",
};

const CALENDARS_LIST_TARGET: PageJumpTargetDraft = {
  id: "calendars",
  label: "Calendar list",
};

const withPickDigits = (
  targets: readonly PageJumpTargetDraft[],
): PageJumpTargets =>
  targets.slice(0, PICK_KEY_LABELS.length).map((target, index) => ({
    ...target,
    digit: PICK_KEY_LABELS[index] ?? "",
  }));

/** `accountKey` is provider-scoped, so same-email accounts get distinct ids. */
export const calendarAccountJumpId = (
  accountKey: string,
): `${typeof CALENDAR_ACCOUNT_JUMP_ID_PREFIX}${string}` =>
  `${CALENDAR_ACCOUNT_JUMP_ID_PREFIX}${accountKey}`;

/**
 * Sidebar calendar slots after month picker / Up next: one numbered target
 * per connected account so hold-Mod jumps straight to that heading. With no
 * accounts, keep a single list-level slot for the anonymous / disconnected
 * calendar rows.
 */
const calendarListJumpTargets = (
  accounts: readonly AccountRef[],
): PageJumpTargetDraft[] =>
  accounts.length === 0
    ? [CALENDARS_LIST_TARGET]
    : accounts.map((account) => ({
        id: calendarAccountJumpId(account.key),
        label: defaultCalendarGroupLabel(
          account.accountEmail,
          account.provider,
        ),
      }));

/**
 * Week (and the Day sidebar suffix): view dropdown, month picker, Up next,
 * then each connected account. Extra accounts that would overflow the
 * physical top-row keys are omitted — no chip, no binding.
 */
export const buildCalendarPageJumpTargets = (
  accounts: readonly AccountRef[] = [],
): PageJumpTargets =>
  withPickDigits([
    VIEW_SELECT_TARGET,
    MONTH_PICKER_TARGET,
    UP_NEXT_TARGET,
    ...calendarListJumpTargets(accounts),
  ]);

/** No-account Week map. Prefer `buildCalendarPageJumpTargets` when accounts exist. */
export const CALENDAR_PAGE_JUMP_TARGETS: PageJumpTargets =
  buildCalendarPageJumpTargets();

export const LIFE_PAGE_JUMP_TARGETS: PageJumpTargets = withPickDigits([
  { id: "view-select", label: "View dropdown" },
  { id: "life-grid", label: "Current week" },
  { id: "life-variation", label: "Life variation" },
  { id: "life-details", label: "Life details" },
]);

export type DayColumnJumpCalendar = {
  id: string;
  name: string;
};

export const dayColumnJumpId = (
  calendarId: string,
): `${typeof DAY_COLUMN_JUMP_ID_PREFIX}${string}` =>
  `${DAY_COLUMN_JUMP_ID_PREFIX}${calendarId}`;

/**
 * Day view's hold-Mod map in visual left-to-right order: the view dropdown,
 * then one numbered target per writable displayed column, then the sidebar
 * page areas (month picker, Up next, each account). Extra calendars that
 * would crowd out the reserved sidebar slots are omitted — no chip, no
 * binding.
 */
export const buildDayPageJumpTargets = (
  calendars: readonly DayColumnJumpCalendar[],
  accounts: readonly AccountRef[] = [],
): PageJumpTargets => {
  const [viewSelect, ...sidebarTargets] =
    buildCalendarPageJumpTargets(accounts);
  const maxColumns = PICK_KEY_LABELS.length - 1 - sidebarTargets.length;
  const columnTargets = calendars
    .slice(0, Math.max(0, maxColumns))
    .map((calendar) => ({
      id: dayColumnJumpId(calendar.id),
      label: calendar.name,
    }));

  return withPickDigits([viewSelect, ...columnTargets, ...sidebarTargets]);
};

/** Spread onto a component's container element to mark it as a jump target. */
export const pageJumpAttrs = (
  id: PageJumpTargetId,
): { [PAGE_JUMP_ATTRIBUTE]: PageJumpTargetId } => ({
  [PAGE_JUMP_ATTRIBUTE]: id,
});

/**
 * Match by attribute value rather than interpolating `id` into a selector:
 * account keys can contain CSS-significant characters (`:`, `+`, `.`).
 */
export const getPageJumpAnchor = (id: PageJumpTargetId): HTMLElement | null => {
  for (const element of document.querySelectorAll<HTMLElement>(
    `[${PAGE_JUMP_ATTRIBUTE}]`,
  )) {
    if (element.getAttribute(PAGE_JUMP_ATTRIBUTE) === id) {
      return element;
    }
  }
  return null;
};

const INTERACTIVE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The element a jump would focus, or null if the target isn't currently
 * usable. An explicit `[tabindex="0"]` wins over document order so a roving
 * tab stop (the month picker keeps exactly one day at tabindex=0) is landed
 * on directly, and arrow keys / Tab work from there right away.
 */
export const getPageJumpFocusElement = (
  id: PageJumpTargetId,
): HTMLElement | null => {
  const anchor = getPageJumpAnchor(id);
  if (!anchor) return null;
  return (
    anchor.querySelector<HTMLElement>('[tabindex="0"]') ??
    (anchor.matches(INTERACTIVE_SELECTOR)
      ? anchor
      : anchor.querySelector<HTMLElement>(INTERACTIVE_SELECTOR))
  );
};

const shouldOpenOnJump = (element: HTMLElement): boolean =>
  element.getAttribute("aria-expanded") === "false";

/**
 * Focus a page jump target; returns whether a focusable element was found.
 * Closed menus and collapsed account headings are clicked after focus so
 * the jump reveals their contents instead of landing on a closed control.
 */
export const focusPageJumpTarget = (id: PageJumpTargetId): boolean => {
  const element = getPageJumpFocusElement(id);
  if (!element) return false;
  element.focus();
  if (shouldOpenOnJump(element)) {
    element.click();
  }
  return true;
};
