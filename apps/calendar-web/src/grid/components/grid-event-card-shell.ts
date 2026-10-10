import cn from "classnames";
import { type CSSProperties } from "react";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { ZIndex } from "@web/common/constants/web.constants";
import { brighten, darken, isDark } from "@web/common/styles/color.utils";
import { type GridGuestResponseState } from "@web/events/attendee-rsvp";
import {
  calendarAccentAccessibleSuffix,
  type EventCardFill,
  eventFocusOutlineClass,
} from "@web/grid/components/calendar-accent.util";
import { gridEventCardOpacity } from "@web/grid/grid-event-card-chrome";
import { type EventPosition } from "@web/grid/types/grid.types";

/**
 * Past events recede in the direction of the theme's grid: the dark theme's
 * light steel fill dims slightly, the light theme's ink fill fades toward the
 * paper (brighten 14 keeps light text >= 4.5:1 and stays clearly apart from
 * the brighten-10 hover fill). Only the fill moves - a `brightness()` filter
 * would drag the title text along with it and let past events fall below the
 * 4.5:1 contrast minimum.
 */
export const pastEventFill = (fill: string): string =>
  isDark(fill) ? brighten(fill, 14) : darken(fill, 5);

/**
 * Position, fill vars, and focus chrome for a grid event card. Shared by
 * TimedEventCard and AllDayEventCard so the two cannot drift on which vars
 * the card exposes or how position maps onto the absolute box.
 */
export function gridEventCardStyle({
  boxShadow,
  fill,
  filter,
  focusColorCss,
  guestResponse,
  isHidden,
  isPlaceholder,
  position,
}: {
  boxShadow: CSSProperties["boxShadow"];
  fill: EventCardFill;
  /** Draft lift on timed cards; all-day cards pass nothing. */
  filter?: CSSProperties["filter"];
  focusColorCss: string;
  guestResponse?: GridGuestResponseState | null;
  isHidden: boolean;
  isPlaceholder: boolean;
  position: EventPosition;
}): CSSProperties {
  return {
    "--event-bg": fill.bgColor,
    "--event-hover-bg": fill.hoverBgColor,
    ...fill.imageVars,
    "--event-focus-color": focusColorCss,
    height: position.height || 0,
    left: position.left,
    opacity: gridEventCardOpacity({ isHidden, isPlaceholder, guestResponse }),
    top: position.top,
    width: position.width || 0,
    zIndex: position.zIndex ?? ZIndex.LAYER_1,
    boxShadow,
    filter,
  } as CSSProperties;
}

/**
 * Card shell classes shared by both grid cards. The dashed outline marks a
 * card whose attendance is unsettled (sample, awaiting, tentative), which is
 * the same signal on either card.
 */
export function gridEventCardClassName({
  focusedEdge,
  guestResponse,
  isDemo,
  isHidden,
  isMerged,
  isSelected,
}: {
  focusedEdge: "startDate" | "endDate" | null;
  guestResponse?: GridGuestResponseState | null;
  isDemo?: boolean;
  isHidden: boolean;
  isMerged: boolean;
  isSelected: boolean;
}): string {
  return cn(
    "absolute min-h-2.5 overflow-hidden bg-(--event-bg) pr-0.75 pl-1.25 transition-[background-color,filter] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-(--event-hover-bg)",
    isHidden ? "rounded-full" : "rounded-xs",
    isMerged &&
      "bg-(image:--event-bg-image) hover:bg-(image:--event-hover-bg-image)",
    (isDemo === true ||
      guestResponse === "awaiting" ||
      guestResponse === "tentative") &&
      "outline outline-dashed outline-1 outline-text-muted/50",
    eventFocusOutlineClass(focusedEdge),
    isSelected && "focus-visible:outline-none",
  );
}

/**
 * The tail of a card's accessible label: which calendars it came from, then
 * which edge is being edited. Timed cards edit times, all-day cards edit
 * dates, so the noun is the only difference.
 */
export function gridEventCardLabelSuffix({
  calendarIdentity,
  edgeNoun,
  focusedEdge,
}: {
  calendarIdentity?: CalendarCardIdentity | null;
  edgeNoun: "date" | "time";
  focusedEdge: "startDate" | "endDate" | null;
}): string {
  const accent = calendarIdentity
    ? calendarAccentAccessibleSuffix(calendarIdentity)
    : "";
  const edge =
    focusedEdge === "startDate"
      ? `, editing start ${edgeNoun}`
      : focusedEdge === "endDate"
        ? `, editing end ${edgeNoun}`
        : "";
  return `${accent}${edge}`;
}
