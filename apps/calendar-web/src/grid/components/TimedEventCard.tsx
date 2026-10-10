import {
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  type MouseEvent,
  useMemo,
} from "react";
import dayjs from "@core/util/date/dayjs";
import { isRecurringEvent } from "@core/util/event/event.util";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { ZIndex } from "@web/common/constants/web.constants";
import { brighten } from "@web/common/styles/color.utils";
import { theme } from "@web/common/styles/theme";
import { useEventPalette } from "@web/common/styles/theme.util";
import { type GridEvent } from "@web/common/types/web.event.types";
import { getTimesLabel } from "@web/common/utils/datetime/web.date.util";
import { getLineClamp } from "@web/common/utils/grid/grid.util";
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
import {
  COMPACT_EVENT_MAX_HEIGHT,
  GRID_EVENT_TIME_LABEL_FONT_SIZE,
  GRID_EVENT_TIME_LABEL_LINE_HEIGHT,
  GRID_EVENT_TIME_LABEL_OPACITY,
  GRID_EVENT_TITLE_COMPACT_FONT_SIZE,
  GRID_EVENT_TITLE_COMPACT_LINE_HEIGHT,
  GRID_EVENT_TITLE_FONT_SIZE,
  GRID_EVENT_TITLE_LINE_HEIGHT,
  MIN_EVENT_HEIGHT_FOR_TIME_LABEL,
  MIN_EVENT_WIDTH_FOR_TIME_LABEL,
} from "@web/grid/grid.constants";
import { guestResponseAccessiblePrefix } from "@web/grid/grid-event-card-chrome";
import {
  EVENT_CONTENT_ATTRIBUTE,
  EVENT_TIME_LABEL_ATTRIBUTE,
} from "@web/grid/interaction/dom";
import { type EventPosition } from "@web/grid/types/grid.types";
import { EventRepeatIcon } from "./EventRepeatIcon";

// Gate the repeat indicator on the event's duration, not its rendered pixel
// height: a true 15-minute event and one resized down to 15 minutes are laid
// out through different height paths that straddle a pixel threshold, so the
// same 15-minute event would show the icon in one case and hide it in the
// other. Duration is the same regardless of render path. 15 min is the minimum
// event length, so every recurring timed event qualifies.
const REPEAT_ICON_MIN_DURATION_MINUTES = 15;
const REPEAT_ICON_MIN_WIDTH = 40;

interface TimedEventCardProps {
  boxShadow?: CSSProperties["boxShadow"];
  /** Resolved by a list-level useCalendarLookup call, not fetched here. */
  calendarIdentity?: CalendarCardIdentity | null;
  displayMode: "draft" | "placeholder" | "saved";
  event: GridEvent;
  /** Calendar backgroundColor for focus chrome; null falls back to --text. */
  focusColor?: string | null;
  guestResponse?: GridGuestResponseState | null;
  interactionAttributes?: Record<string, string | undefined>;
  isHidden?: boolean;
  isSelected?: boolean;
  motionMode: "dragging" | "idle" | "resizing";
  onBlur?: () => void;
  onEventKeyDown?: (event: GridEvent) => void;
  onFocus?: () => void;
  onMouseEnter?: (e: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLDivElement>) => void;
  position: EventPosition;
}

const TimedEventCardBase = (
  {
    boxShadow,
    calendarIdentity = null,
    displayMode,
    event,
    focusColor = null,
    guestResponse = null,
    interactionAttributes,
    isHidden = false,
    isSelected = false,
    motionMode,
    onBlur,
    onEventKeyDown,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    position,
  }: TimedEventCardProps,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  const isDraft = displayMode === "draft";
  const isDragging = motionMode === "dragging";
  const isPlaceholder = displayMode === "placeholder";
  const isResizing = motionMode === "resizing";
  const isInPast = dayjs().isAfter(dayjs(event.endDate));
  const isRecurring = isRecurringEvent(event);
  const durationMinutes = dayjs(event.endDate).diff(
    dayjs(event.startDate),
    "minute",
  );
  const showRepeatIcon =
    !isHidden &&
    isRecurring &&
    !isPlaceholder &&
    durationMinutes >= REPEAT_ICON_MIN_DURATION_MINUTES &&
    position.width >= REPEAT_ICON_MIN_WIDTH;

  const showTimeLabel =
    !isHidden &&
    !event.isAllDay &&
    (isDraft || !isInPast) &&
    position.height >= MIN_EVENT_HEIGHT_FOR_TIME_LABEL &&
    position.width >= MIN_EVENT_WIDTH_FOR_TIME_LABEL;

  // Clamp the title against the height the label leaves behind, not the whole
  // card. Clamping against the full height lets a wrapping title occupy every
  // line the card has and shove the label past the card's clipped edge.
  const lineClamp = useMemo(
    () =>
      getLineClamp(
        showTimeLabel
          ? position.height - GRID_EVENT_TIME_LABEL_LINE_HEIGHT
          : position.height,
      ),
    [position.height, showTimeLabel],
  );

  const { base: baseColor } = useEventPalette(event.color, event.colorHex);
  // Draft fills use the same base as saved cards so the Week overlay matches
  // the form/context-menu swatch (and the eventual save). Draft vs saved is
  // carried by a light drop-shadow below — enough lift to read as a draft
  // without a heavy bottom shadow that obscures the end edge.
  const adjustFill = (fill: string) => {
    if (isDraft) return fill;
    if (isResizing || isDragging) return brighten(fill);
    if (isInPast) return pastEventFill(fill);
    return fill;
  };
  // isInPast is excluded here (falls through to adjustFill, i.e. the dimmed
  // fill) so a past event stays dimmed on hover instead of snapping to full
  // brightness. brighten(fill) is the palette's own hover step.
  const adjustHover = (fill: string) =>
    !isDraft && !isPlaceholder && !isResizing && !isInPast
      ? brighten(fill)
      : adjustFill(fill);
  const fill = eventCardFill(
    calendarIdentity,
    baseColor,
    adjustFill,
    adjustHover,
  );
  // Ring color follows --text so it contrasts with the page in both themes;
  // a fixed white ring vanished on the light theme's paper background. Pair
  // with a background halo so the ring stays visible on dark default fills.
  const { focusedEdge, focusColorCss, edgeFocusShadow } = useGridEventEdgeFocus(
    event._id,
    focusColor,
    "vertical",
  );

  // The fill is neutral and its lightness swings widely across states, so the
  // text color is chosen per-state (whichever of dark/light reads better
  // across every stop) and set on the content wrapper so the title and time
  // label share it.
  const contentColor = theme.getContrastText(fill.fillStops);

  const eventStyle = gridEventCardStyle({
    boxShadow: joinGridEventBoxShadow(
      isSelected && GRID_EVENT_SIDEBAR_EDITING_BOX_SHADOW,
      boxShadow,
      edgeFocusShadow,
    ),
    fill,
    filter: isDraft ? "drop-shadow(0 1px 2px rgb(0 0 0 / 0.28))" : undefined,
    focusColorCss,
    guestResponse,
    isHidden,
    isPlaceholder,
    position,
  });

  const isCompactEvent = position.height <= COMPACT_EVENT_MAX_HEIGHT;

  const titleStyle: CSSProperties = {
    fontSize: isCompactEvent
      ? GRID_EVENT_TITLE_COMPACT_FONT_SIZE
      : GRID_EVENT_TITLE_FONT_SIZE,
    lineHeight: isCompactEvent
      ? GRID_EVENT_TITLE_COMPACT_LINE_HEIGHT
      : GRID_EVENT_TITLE_LINE_HEIGHT,
    minHeight: "3px",
    display: "-webkit-box",
    overflow: "hidden",
    // overflowWrap wraps at word boundaries and only breaks mid-word when a
    // single token (e.g. a long URL) can't fit; -webkit-line-clamp supplies
    // the trailing ellipsis itself, so text-overflow has no effect here.
    overflowWrap: "anywhere",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lineClamp,
  };

  const timeLabelStyle: CSSProperties = {
    fontSize: GRID_EVENT_TIME_LABEL_FONT_SIZE,
    opacity: GRID_EVENT_TIME_LABEL_OPACITY,
    whiteSpace: "nowrap",
  };

  const eventTitle = event.title || "Untitled event";
  const timeRange =
    !event.isAllDay && event.startDate && event.endDate
      ? getTimesLabel(event.startDate, event.endDate)
      : null;
  const recurringPrefix = isRecurring ? "Recurring " : "";
  const baseAccessibleLabel = event.isAllDay
    ? `${recurringPrefix}All-day event: ${eventTitle}`
    : `${recurringPrefix}Timed event: ${eventTitle}, ${timeRange ?? "time not set"}`;
  const samplePrefix = event.isDemo ? "Sample " : "";
  const hiddenPrefix = isHidden ? "Hidden " : "";
  const guestResponsePrefix = guestResponseAccessiblePrefix(guestResponse);
  // Fill stays a flat neutral color except on a merged card, whose gradient
  // paints its calendars; the accent or gradient + the label suffix are the
  // only calendar signal, and the name (never color alone) is what makes it
  // accessible (A9).
  const accessibleLabel = `${hiddenPrefix}${guestResponsePrefix}${samplePrefix}${baseAccessibleLabel}${gridEventCardLabelSuffix(
    { calendarIdentity, edgeNoun: "time", focusedEdge },
  )}`;

  return (
    // biome-ignore lint/a11y/useSemanticElements: Grid events are draggable/resizable blocks, not native buttons.
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
      style={eventStyle}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={gridEventCardActivationKeyDown(event, onEventKeyDown)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {!isHidden && calendarIdentity && !fill.mergedStops && (
        <CalendarAccentStripe identity={calendarIdentity} />
      )}
      {!isHidden && (
        <div
          className="flex flex-col flex-wrap items-start"
          style={{ color: contentColor }}
          {...{ [EVENT_CONTENT_ATTRIBUTE]: "true" }}
        >
          <span style={titleStyle}>{event.title}</span>
          {!event.isAllDay && showTimeLabel && (
            <span
              className="relative"
              {...{ [EVENT_TIME_LABEL_ATTRIBUTE]: "true" }}
              style={{ ...timeLabelStyle, zIndex: ZIndex.LAYER_3 }}
            >
              {timeRange}
            </span>
          )}
        </div>
      )}
      {showRepeatIcon && <EventRepeatIcon baseColor={fill.bgColor} />}
    </div>
  );
};

export const TimedEventCard = forwardRef(TimedEventCardBase);
