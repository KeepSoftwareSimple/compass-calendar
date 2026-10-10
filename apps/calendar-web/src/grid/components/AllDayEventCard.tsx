import cn from "classnames";
import { type ForwardedRef, forwardRef, type MouseEvent } from "react";
import dayjs from "@core/util/date/dayjs";
import { isRecurringEvent } from "@core/util/event/event.util";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { brighten } from "@web/common/styles/color.utils";
import { theme } from "@web/common/styles/theme";
import { useEventPalette } from "@web/common/styles/theme.util";
import { type GridEvent } from "@web/common/types/web.event.types";
import { type GridGuestResponseState } from "@web/events/attendee-rsvp";
import { CalendarAccentStripe } from "@web/grid/components/CalendarAccentStripe";
import {
  eventCardFill,
  GRID_EVENT_SIDEBAR_EDITING_BOX_SHADOW,
  joinGridEventBoxShadow,
} from "@web/grid/components/calendar-accent.util";
import { gridEventCardActivationKeyDown } from "@web/grid/components/event-card-activation";
import {
  gridEventCardClassName,
  gridEventCardLabelSuffix,
  gridEventCardStyle,
  pastEventFill,
} from "@web/grid/components/grid-event-card-shell";
import { useGridEventEdgeFocus } from "@web/grid/components/useGridEventEdgeFocus";
import { guestResponseAccessiblePrefix } from "@web/grid/grid-event-card-chrome";
import { type EventPosition } from "@web/grid/types/grid.types";
import { EventRepeatIcon } from "./EventRepeatIcon";

const REPEAT_ICON_MIN_WIDTH = 60;

export interface AllDayEventCardProps {
  /** Resolved by a list-level useCalendarLookup call, not fetched here. */
  calendarIdentity?: CalendarCardIdentity | null;
  event: GridEvent;
  /** Calendar backgroundColor for focus chrome; null falls back to --text. */
  focusColor?: string | null;
  guestResponse?: GridGuestResponseState | null;
  interactionAttributes?: Record<string, string | undefined>;
  isHidden?: boolean;
  isPlaceholder: boolean;
  isSelected?: boolean;
  onEventKeyDown?: (event: GridEvent) => void;
  onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void;
  position: EventPosition;
}

const AllDayEventCardBase = (
  {
    calendarIdentity = null,
    event,
    focusColor = null,
    guestResponse = null,
    interactionAttributes,
    isHidden = false,
    isPlaceholder,
    isSelected = false,
    onEventKeyDown,
    onMouseEnter,
    onMouseLeave,
    position,
  }: AllDayEventCardProps,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  const { base: baseColor } = useEventPalette(event.color, event.colorHex);
  const isInPast = dayjs().isAfter(dayjs(event.endDate));
  const isRecurring = isRecurringEvent(event);
  const showRepeatIcon =
    !isHidden &&
    isRecurring &&
    !isPlaceholder &&
    position.width >= REPEAT_ICON_MIN_WIDTH;
  const adjustFill = (fill: string) => (isInPast ? pastEventFill(fill) : fill);
  // isInPast is excluded here (falls through to adjustFill) so a past event
  // stays dimmed on hover instead of snapping to full brightness.
  // brighten(fill) is the palette's own hover step.
  const adjustHover = (fill: string) =>
    !isPlaceholder && !isInPast ? brighten(fill) : adjustFill(fill);
  const fill = eventCardFill(
    calendarIdentity,
    baseColor,
    adjustFill,
    adjustHover,
  );
  // Chosen per-fill (whichever of dark/light reads better across every stop)
  // rather than a fixed color, matching TimedEventCard, so a future
  // fill/darken tweak can't quietly drop the title below 4.5:1.
  const titleColor = theme.getContrastText(fill.fillStops);

  const { focusedEdge, focusColorCss, edgeFocusShadow } = useGridEventEdgeFocus(
    event._id,
    focusColor,
    "horizontal",
  );

  const guestResponsePrefix = guestResponseAccessiblePrefix(guestResponse);
  // Fill stays a flat neutral color except on a merged card, whose gradient
  // paints its calendars; the accent or gradient + the label suffix are the
  // only calendar signal, and the name (never color alone) is what makes it
  // accessible (A9).
  const accessibleLabel = `${isHidden ? "Hidden " : ""}${guestResponsePrefix}${isRecurring ? "Recurring " : ""}${event.isDemo ? "Sample " : ""}All-day event: ${event.title || "Untitled event"}${gridEventCardLabelSuffix(
    { calendarIdentity, edgeNoun: "date", focusedEdge },
  )}`;

  return (
    // biome-ignore lint/a11y/useSemanticElements: All-day events are draggable/resizable blocks, not native buttons.
    <div
      {...interactionAttributes}
      aria-label={accessibleLabel}
      data-edge-focus={focusedEdge ?? undefined}
      ref={ref}
      role="button"
      tabIndex={0}
      title={isHidden ? event.title : undefined}
      className={gridEventCardClassName({
        focusedEdge,
        guestResponse,
        isDemo: event.isDemo,
        isHidden,
        isMerged: fill.mergedStops !== null,
        isSelected,
      })}
      style={gridEventCardStyle({
        boxShadow: joinGridEventBoxShadow(
          isSelected && GRID_EVENT_SIDEBAR_EDITING_BOX_SHADOW,
          edgeFocusShadow,
        ),
        fill,
        focusColorCss,
        guestResponse,
        isHidden,
        isPlaceholder,
        position,
      })}
      onKeyDown={gridEventCardActivationKeyDown(event, onEventKeyDown)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {!isHidden && calendarIdentity && !fill.mergedStops && (
        <CalendarAccentStripe identity={calendarIdentity} />
      )}
      {!isHidden && (
        <div
          className={cn("flex min-w-0 items-center", {
            // Reserve room so a long title truncates before the bottom-right icon.
            "pr-3.5": showRepeatIcon,
          })}
        >
          <span
            className="relative min-w-0 truncate text-xs"
            style={{ color: titleColor }}
          >
            {event.title}
            {"\u00A0"}
          </span>
        </div>
      )}
      {showRepeatIcon && <EventRepeatIcon baseColor={fill.bgColor} />}
    </div>
  );
};

export const AllDayEventCard = forwardRef(AllDayEventCardBase);
