import cn from "classnames";
import {
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  type KeyboardEvent,
  type MouseEvent,
  useMemo,
} from "react";
import dayjs from "@core/util/date/dayjs";
import { isRecurringEvent } from "@core/util/event/event.util";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { ZIndex } from "@web/common/constants/web.constants";
import { brighten, darken, isDark } from "@web/common/styles/color.utils";
import { theme } from "@web/common/styles/theme";
import { useEventPalette } from "@web/common/styles/theme.util";
import { type GridEvent } from "@web/common/types/web.event.types";
import { getTimesLabel } from "@web/common/utils/datetime/web.date.util";
import { getLineClamp } from "@web/common/utils/grid/grid.util";
import {
  calendarAccentAccessibleSuffix,
  calendarAccentStyle,
  eventEdgeFocusShadow,
  eventFocusColor,
  eventFocusOutlineClass,
} from "@web/grid/components/calendar-accent.util";
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
import {
  EVENT_CONTENT_ATTRIBUTE,
  EVENT_TIME_LABEL_ATTRIBUTE,
} from "@web/grid/interaction/dom";
import {
  selectEdgeForEvent,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { type EventPosition } from "@web/grid/types/grid.types";
import { eventPointerActionAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
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

  const { base: baseColor, hover: hoverColor } = useEventPalette(
    event.color,
    event.colorHex,
  );
  // Draft fills use the same base as saved cards so the Week overlay matches
  // the form/context-menu swatch (and the eventual save). Draft vs saved is
  // carried by a light drop-shadow below — enough lift to read as a draft
  // without a heavy bottom shadow that obscures the end edge.
  // Past events recede in the direction of the theme's grid: the dark theme's
  // light steel fill dims slightly, the light theme's ink fill fades toward
  // the paper (brighten 14 keeps light text >= 4.5:1 and stays clearly apart
  // from the brighten-10 hover fill). A `brightness()` filter can't do either
  // safely — it scales the title text along with the fill.
  const pastColor = isDark(baseColor)
    ? brighten(baseColor, 14)
    : darken(baseColor, 5);
  // Ring color follows --text so it contrasts with the page in both themes;
  // a fixed white ring vanished on the light theme's paper background. Pair
  // with a background halo so the ring stays visible on dark default fills.
  const selectedBoxShadow =
    "0 0 0 1px var(--background), 0 0 0 3px color-mix(in srgb, var(--text) 70%, transparent)";
  const focusedEdge = useEdgeFocusStore(selectEdgeForEvent(event._id));
  const focusColorCss = eventFocusColor(focusColor);
  // Edge focus paints outside the card (box-shadow) so short titles stay
  // readable — an inset accent bar used to cover the top of compact events.
  const edgeFocusShadow = focusedEdge
    ? eventEdgeFocusShadow(focusedEdge, "vertical", focusColorCss)
    : undefined;

  const bgColor = (() => {
    if (isDraft) return baseColor;
    if (isResizing || isDragging) return brighten(baseColor);
    if (isInPast) return pastColor;
    return baseColor;
  })();
  const eventBoxShadow =
    [isSelected ? selectedBoxShadow : null, boxShadow, edgeFocusShadow]
      .filter(Boolean)
      .join(", ") || undefined;

  // isInPast is excluded here (falls through to bgColor, i.e. pastColor) so
  // a past event stays dimmed on hover instead of snapping to full brightness.
  const hoverBgColor =
    !isDraft && !isPlaceholder && !isResizing && !isInPast
      ? hoverColor
      : bgColor;
  // The fill is neutral and its lightness swings widely across states, so the
  // text color is chosen per-state (whichever of dark/light reads better) and
  // set on the content wrapper so the title and time label share it.
  const contentColor = theme.getContrastText(bgColor);

  const eventStyle = {
    "--event-bg": bgColor,
    "--event-hover-bg": hoverBgColor,
    "--event-focus-color": focusColorCss,
    height: position.height || 0,
    left: position.left,
    opacity: isHidden ? 0.6 : isPlaceholder ? 0.5 : undefined,
    top: position.top,
    width: position.width || 0,
    zIndex: position.zIndex ?? ZIndex.LAYER_1,
    boxShadow: eventBoxShadow,
    filter: isDraft ? "drop-shadow(0 1px 2px rgb(0 0 0 / 0.28))" : undefined,
  } as CSSProperties;

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
  // Fill stays a flat neutral color; the accent + this suffix are the only
  // calendar signal, and the name (never color alone) is what makes it
  // accessible (A9).
  const edgeFocusSuffix =
    focusedEdge === "startDate"
      ? ", editing start time"
      : focusedEdge === "endDate"
        ? ", editing end time"
        : "";
  const accessibleLabel =
    (calendarIdentity
      ? `${hiddenPrefix}${samplePrefix}${baseAccessibleLabel}${calendarAccentAccessibleSuffix(calendarIdentity)}`
      : `${hiddenPrefix}${samplePrefix}${baseAccessibleLabel}`) +
    edgeFocusSuffix;

  return (
    // biome-ignore lint/a11y/useSemanticElements: Grid events are draggable/resizable blocks, not native buttons.
    <div
      {...interactionAttributes}
      {...eventPointerActionAttributes(isPlaceholder ? undefined : event._id)}
      aria-label={accessibleLabel}
      data-edge-focus={focusedEdge ?? undefined}
      ref={ref}
      role="button"
      tabIndex={0}
      title={isHidden ? event.title : undefined}
      className={cn(
        "absolute min-h-2.5 overflow-hidden pr-0.75 pl-1.25 transition-[background-color,filter] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        isHidden ? "rounded-full" : "rounded-xs",
        "bg-(--event-bg) hover:bg-(--event-hover-bg)",
        "hover:cursor-pointer",
        eventFocusOutlineClass(focusedEdge),
        event.isDemo &&
          "outline outline-dashed outline-1 outline-text-muted/50",
      )}
      style={eventStyle}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "Enter" && e.key !== " ") {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        if (!onEventKeyDown) {
          return;
        }

        onEventKeyDown(event);
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {!isHidden && calendarIdentity && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px]"
          style={calendarAccentStyle(calendarIdentity)}
        />
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
      {showRepeatIcon && <EventRepeatIcon baseColor={bgColor} />}
    </div>
  );
};

export const TimedEventCard = forwardRef(TimedEventCardBase);
