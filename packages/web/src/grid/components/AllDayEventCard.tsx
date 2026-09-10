import cn from "classnames";
import {
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import dayjs from "@core/util/date/dayjs";
import { isRecurringEvent } from "@core/util/event/event.util";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { ZIndex } from "@web/common/constants/web.constants";
import { brighten, darken, isDark } from "@web/common/styles/color.utils";
import { theme } from "@web/common/styles/theme";
import { useEventPalette } from "@web/common/styles/theme.util";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  calendarAccentAccessibleSuffix,
  calendarAccentStyle,
  eventEdgeFocusShadow,
  eventFocusColor,
  eventFocusOutlineClass,
} from "@web/grid/components/calendar-accent.util";
import {
  selectEdgeForEvent,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { type EventPosition } from "@web/grid/types/grid.types";
import { eventPointerActionAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
import { EventRepeatIcon } from "./EventRepeatIcon";

const REPEAT_ICON_MIN_WIDTH = 60;

export interface AllDayEventCardProps {
  /** Resolved by a list-level useCalendarLookup call, not fetched here. */
  calendarIdentity?: CalendarCardIdentity | null;
  event: GridEvent;
  /** Calendar backgroundColor for focus chrome; null falls back to --text. */
  focusColor?: string | null;
  interactionAttributes?: Record<string, string | undefined>;
  isHidden?: boolean;
  isPlaceholder: boolean;
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
    interactionAttributes,
    isHidden = false,
    isPlaceholder,
    onEventKeyDown,
    onMouseEnter,
    onMouseLeave,
    position,
  }: AllDayEventCardProps,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  const { base: baseColor, hover: hoverColor } = useEventPalette(
    event.color,
    event.colorHex,
  );
  const isInPast = dayjs().isAfter(dayjs(event.endDate));
  const isRecurring = isRecurringEvent(event);
  const showRepeatIcon =
    !isHidden &&
    isRecurring &&
    !isPlaceholder &&
    position.width >= REPEAT_ICON_MIN_WIDTH;
  // Past events recede in the direction of the theme's grid, matching
  // TimedEventCard: the dark theme's light steel fill dims slightly, the
  // light theme's ink fill fades toward the paper. Only the fill moves — a
  // `brightness()` filter would drag the title text along with it and let
  // past events fall below the 4.5:1 contrast minimum.
  const bgColor = isInPast
    ? isDark(baseColor)
      ? brighten(baseColor, 14)
      : darken(baseColor, 5)
    : baseColor;
  // isInPast is excluded here (falls through to bgColor) so a past event
  // stays dimmed on hover instead of snapping to full brightness.
  const hoverBgColor = !isPlaceholder && !isInPast ? hoverColor : bgColor;
  // Chosen per-fill (whichever of dark/light reads better) rather than a fixed
  // color, matching TimedEventCard, so a future fill/darken tweak can't quietly
  // drop the title below 4.5:1.
  const titleColor = theme.getContrastText(bgColor);

  const focusedEdge = useEdgeFocusStore(selectEdgeForEvent(event._id));
  const focusColorCss = eventFocusColor(focusColor);
  const edgeFocusShadow = focusedEdge
    ? eventEdgeFocusShadow(focusedEdge, "horizontal", focusColorCss)
    : undefined;

  const eventStyle = {
    "--event-bg": bgColor,
    "--event-hover-bg": hoverBgColor,
    "--event-focus-color": focusColorCss,
    height: position.height,
    left: position.left,
    opacity: isHidden ? 0.6 : isPlaceholder ? 0.5 : undefined,
    top: position.top,
    width: position.width,
    zIndex: position.zIndex ?? ZIndex.LAYER_1,
    boxShadow: edgeFocusShadow,
  } as CSSProperties;

  const baseAccessibleLabel = `${isHidden ? "Hidden " : ""}${isRecurring ? "Recurring " : ""}${event.isDemo ? "Sample " : ""}All-day event: ${event.title || "Untitled event"}`;
  // Fill stays a flat neutral color; the accent + this suffix are the only
  // calendar signal, and the name (never color alone) is what makes it
  // accessible (A9).
  const edgeFocusSuffix =
    focusedEdge === "startDate"
      ? ", editing start date"
      : focusedEdge === "endDate"
        ? ", editing end date"
        : "";
  const accessibleLabel =
    (calendarIdentity
      ? `${baseAccessibleLabel}${calendarAccentAccessibleSuffix(calendarIdentity)}`
      : baseAccessibleLabel) + edgeFocusSuffix;

  return (
    // biome-ignore lint/a11y/useSemanticElements: All-day events are draggable/resizable blocks, not native buttons.
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
        "absolute min-h-2.5 overflow-hidden bg-(--event-bg) pr-0.75 pl-1.25 transition-[background-color,filter] duration-260 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-(--event-hover-bg)",
        isHidden ? "rounded-full" : "rounded-xs",
        {
          "hover:cursor-pointer": !isPlaceholder,
          "outline outline-dashed outline-1 outline-text-muted/50":
            event.isDemo,
        },
        eventFocusOutlineClass(focusedEdge),
      )}
      style={eventStyle}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "Enter" && e.key !== " ") {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        onEventKeyDown?.(event);
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
      {showRepeatIcon && <EventRepeatIcon baseColor={bgColor} />}
    </div>
  );
};

export const AllDayEventCard = forwardRef(AllDayEventCardBase);
