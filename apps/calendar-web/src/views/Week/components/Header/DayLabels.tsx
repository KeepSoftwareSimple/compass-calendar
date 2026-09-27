import cn from "classnames";
import { type FC } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Dayjs } from "@core/util/date/dayjs";
import { getWeekDayLabel } from "@web/common/utils/event/event.util";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { EVENT_WIDTH_MINIMUM } from "@web/grid/grid.constants";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import {
  selectPageJumpHintsVisible,
  usePageJumpHintStore,
} from "@web/shortcuts/page-jump/page-jump.store";
import {
  DAY_JUMP_PREFIX_BY_WEEKDAY,
  type DayJumpWeekday,
} from "@web/shortcuts/shift-hint/assign-shift-hint-keys";
import {
  selectEventJumpActive,
  selectEventJumpActiveDayKeys,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { GridTimezoneLabel } from "@web/timezone/GridTimezoneLabel";

const dayJumpPrefix = (day: Dayjs) => {
  const weekday = day.day() as DayJumpWeekday;
  return DAY_JUMP_PREFIX_BY_WEEKDAY[weekday].toUpperCase();
};

interface Props {
  today: Dayjs;
  startOfView: Dayjs;
  week: number;
  weekDays: Dayjs[];
}

export const DayLabels: FC<Props> = ({
  startOfView,
  today,
  week,
  weekDays,
}) => {
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);
  const isEventJumpActive = useEventJumpStore(selectEventJumpActive);
  const pageJumpHintsVisible = usePageJumpHintStore(selectPageJumpHintsVisible);
  const isEventFormOpen = useDraftStore(selectIsEventFormOpen);
  const showDayJumpPrefixes =
    !isEventFormOpen && (pageJumpHintsVisible || isEventJumpActive);
  const marginLeft = useGridMarginLeft();
  const dayJumpHowTo = isEventJumpActive
    ? "Type the day key to focus that column."
    : "Hold Shift and press the day key to focus that column.";
  const dayJumpAnnouncement = showDayJumpPrefixes
    ? `Day jump keys: ${weekDays
        .map((day) => `${day.format("dddd")} ${dayJumpPrefix(day)}`)
        .join(", ")}. ${dayJumpHowTo}`
    : "";
  const getColor = (day: Dayjs) => {
    const isCurrentWeek = today.week() === week;
    const isToday = isCurrentWeek && today.format("DD") === day.format("DD");
    const color = day.isBefore(today, "day")
      ? "var(--text-muted)"
      : isToday
        ? "var(--accent)"
        : "var(--text-muted)";

    return { isToday, color };
  };

  const getDayNumber = (day: Dayjs) => {
    let dayNumber = day.format("D");

    dayNumber =
      day.format("MM") !== startOfView.format("MM") && day.format("D") === "1"
        ? day.format("MMM D")
        : dayNumber;

    return dayNumber;
  };

  return (
    <div className="relative mt-2.5 min-h-8 w-full">
      <div
        className="absolute inset-y-0 left-0 z-1 flex items-end justify-center pb-0.5"
        style={{ width: marginLeft }}
      >
        <GridTimezoneLabel />
      </div>
      <div
        className="absolute top-0 grid h-full items-end"
        style={{
          left: marginLeft,
          width: `calc(100% - ${marginLeft}px)`,
          gridTemplateColumns: `repeat(${weekDays.length}, minmax(${EVENT_WIDTH_MINIMUM}px, 1fr))`,
        }}
      >
        {weekDays.map((day) => {
          const dayNumber = getDayNumber(day);
          const { isToday, color } = getColor(day);
          const dayKey = day.format(YEAR_MONTH_DAY_FORMAT);
          const isJumpDay = activeDayKeys.includes(dayKey);
          const prefix = dayJumpPrefix(day);

          return (
            <div
              className={cn(
                "flex items-end justify-center gap-1 rounded-sm px-1 transition-colors duration-150 motion-reduce:transition-none",
                isJumpDay && "bg-accent/15 text-accent",
              )}
              data-jump-day={isJumpDay ? "true" : undefined}
              key={getWeekDayLabel(day)}
              style={isJumpDay ? undefined : { color }}
              title={getWeekDayLabel(day)}
            >
              <span
                className={cn(
                  "relative text-[clamp(var(--font-size-xl),2.7cqw,var(--font-size-xxl))] leading-none",
                  isToday && "c-text-gradient",
                )}
              >
                {dayNumber}
              </span>
              {showDayJumpPrefixes ? (
                // Jump mode takes the letter bare; from idle the column is
                // entered with Shift, so the chip has to say so.
                <ShortcutHint>
                  {isEventJumpActive ? prefix : `⇧${prefix}`}
                </ShortcutHint>
              ) : (
                <span className="relative text-[clamp(var(--font-size-m),2cqw,var(--font-size-l))] leading-none">
                  {day.format("ddd")}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {dayJumpAnnouncement ? (
        <span aria-live="polite" className="sr-only" role="status">
          {dayJumpAnnouncement}
        </span>
      ) : null}
    </div>
  );
};
