import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { readability } from "@web/common/styles/color.utils";

/**
 * The accent fill for an ordinary card's identity strip: this calendar's
 * color. A merged card renders no strip; its whole fill is the gradient from
 * {@link calendarGradient} instead.
 */
export function calendarAccentStyle(identity: CalendarCardIdentity): {
  backgroundColor: string;
} {
  return { backgroundColor: identity.backgroundColor };
}

/**
 * The calendar colors a merged card paints across, own calendar first, or
 * null for an ordinary card (A5). Shared by TimedEventCard and
 * AllDayEventCard so the stop order can't drift between the two.
 */
export function mergedCalendarStops(
  identity: CalendarCardIdentity,
): string[] | null {
  const otherColors =
    identity.otherCopies?.map((copy) => copy.backgroundColor) ?? [];
  if (otherColors.length === 0) return null;
  return [identity.backgroundColor, ...otherColors];
}

/**
 * Whole-card fill for a merged card. Diagonal so a 15-minute card, only a
 * few pixels tall, still shows every calendar's color side by side.
 */
export function calendarGradient(stops: string[]): string {
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

export type EventCardFill = {
  mergedStops: string[] | null;
  fillStops: string[];
  bgColor: string;
  hoverBgColor: string;
  imageVars:
    | {
        "--event-bg-image": string;
        "--event-hover-bg-image": string;
      }
    | undefined;
};

/**
 * Flat or merged-card fill vars shared by TimedEventCard and AllDayEventCard.
 * Adjusters stay at the call site: timed cards have draft/resize/drag steps
 * that all-day cards do not.
 */
export function eventCardFill(
  calendarIdentity: CalendarCardIdentity | null | undefined,
  baseColor: string,
  adjustFill: (fill: string) => string,
  adjustHover: (fill: string) => string,
): EventCardFill {
  const mergedStops = calendarIdentity
    ? mergedCalendarStops(calendarIdentity)
    : null;
  const fillStops = (mergedStops ?? [baseColor]).map(adjustFill);
  const fillBase = mergedStops?.[0] ?? baseColor;
  return {
    mergedStops,
    fillStops,
    bgColor: adjustFill(fillBase),
    hoverBgColor: adjustHover(fillBase),
    imageVars: mergedStops
      ? {
          "--event-bg-image": calendarGradient(fillStops),
          "--event-hover-bg-image": calendarGradient(
            mergedStops.map(adjustHover),
          ),
        }
      : undefined,
  };
}

/**
 * The accessible-label suffix for a card's calendar identity, naming the
 * calendars or accounts the other copies came from when this card is a
 * duplicate merge - the gradient accent is otherwise the only visual sign a
 * second copy exists, and accent color alone is never how identity is
 * conveyed (A9).
 */
export function calendarAccentAccessibleSuffix(
  identity: CalendarCardIdentity,
): string {
  const calendarSuffix = `, ${identity.name} calendar`;
  const labels = identity.otherCopies?.map((copy) => copy.label) ?? [];
  if (labels.length === 0) return calendarSuffix;
  const named =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${calendarSuffix}, also on ${named}`;
}

// Light-theme page paper (`--background` under `.theme-light-beach`). Calendar
// colors that fail 3:1 here (local #fff, pale pastels) vanish as outside focus
// chrome on light mode.
const LIGHT_PAGE_PAPER = "#f3eee2";
const MIN_FOCUS_CONTRAST = 3;

/**
 * CSS color for event focus chrome. Falls back to `--text` when no calendar
 * color is available, or when that color is too light to read against the
 * page (same family as the selected ring) so cards never introduce a third
 * theme-accent color and never lose a visible focus indicator.
 */
export function eventFocusColor(focusColor: string | null | undefined): string {
  if (!focusColor) return "var(--text)";
  if (readability(focusColor, LIGHT_PAGE_PAPER) < MIN_FOCUS_CONTRAST) {
    return "var(--text)";
  }
  return focusColor;
}

/** Sidebar-open editing ring: contrasts with the page in both themes. */
export const GRID_EVENT_SIDEBAR_EDITING_BOX_SHADOW =
  "0 0 0 1px var(--background), 0 0 0 3px color-mix(in srgb, var(--text) 70%, transparent)";

export function joinGridEventBoxShadow(
  ...parts: Array<string | undefined | null | false>
): string | undefined {
  const joined = parts.filter(Boolean).join(", ");
  return joined || undefined;
}

/**
 * Whole-card focus outline classes. Suppressed while an edge is focused so
 * only the outer edge line shows (short titles stay readable).
 */
export function eventFocusOutlineClass(
  focusedEdge: "startDate" | "endDate" | null,
): string {
  return focusedEdge
    ? "focus-visible:outline-none"
    : "focus-visible:outline-(--event-focus-color) focus-visible:outline-2 focus-visible:outline-offset-2";
}

/**
 * Outer box-shadow line for start/end edge focus. Drawn outside the card so
 * short-event titles stay readable (unlike an inset accent bar).
 */
export function eventEdgeFocusShadow(
  edge: "startDate" | "endDate",
  axis: "horizontal" | "vertical",
  color: string,
): string {
  if (axis === "vertical") {
    // Timed cards: start = top, end = bottom.
    return edge === "startDate" ? `0 -3px 0 0 ${color}` : `0 3px 0 0 ${color}`;
  }
  // All-day cards: start = left, end = right.
  return edge === "startDate" ? `-3px 0 0 0 ${color}` : `3px 0 0 0 ${color}`;
}
