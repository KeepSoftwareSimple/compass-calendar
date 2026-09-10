import {
  type FC,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { TrialBadge } from "@web/billing/TrialBadge";
import { ID_DATEPICKER_SIDEBAR } from "@web/common/constants/web.constants";
import { DatePicker } from "@web/components/DatePicker/DatePicker";
import { POINTER_ACTIONS } from "@web/shortcuts/keyboard-only/pointer-action";
import { pageJumpAttrs } from "@web/shortcuts/page-jump/page-jump.targets";
import { MonthPickerHint } from "./MonthPickerHint";
import {
  type MonthPickerUnit,
  normalizePickerCursor,
  resolveMonthJumpCursor,
} from "./monthPickerCursor";
import { getMonthPickerDayClassName } from "./monthPickerDayClassName";
import { monthPickerLocale } from "./monthPickerLocale";
import {
  MONTH_PICKER_NEXT_KEYCAPS,
  MONTH_PICKER_PREV_KEYCAPS,
  useMonthPickerShortcuts,
} from "./useMonthPickerShortcuts";

interface Props {
  monthsShown?: number;
  onSelectDate: (date: Dayjs) => void;
  selectedDate: Dayjs;
  viewEnd: Dayjs;
  viewStart: Dayjs;
}

const monthPickerClassName =
  "[&_.calendar]:!block [&_.calendar]:!w-full [&_.calendar]:!max-w-80 [&_.calendar]:!mx-auto [&_.calendar]:!bg-transparent [&_.calendar]:!shadow-none [&_.react-datepicker]:!border-0 [&_.react-datepicker]:!bg-transparent [&_.react-datepicker]:!shadow-none [&_.react-datepicker\\_\\_day-names]:!mb-0 [&_.react-datepicker\\_\\_header.react-datepicker\\_\\_header]:!px-0 [&_.react-datepicker\\_\\_month-container.react-datepicker\\_\\_month-container]:!bg-transparent [&_.react-datepicker\\_\\_month-container.react-datepicker\\_\\_month-container]:!px-0";

const headerActionsClassName = "!ml-2.5";

const DAY_SELECTOR = ".react-datepicker__day";
const TAB_STOP_DAY_SELECTOR = '.react-datepicker__day[tabindex="0"]';

/** Day clicks are inert: the picker is keyboard driven and the pointer hint
 * teaches the keyboard path on click (data-pointer-action below). */
const swallowDayPointer = (event: MouseEvent<HTMLElement>) => {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest(DAY_SELECTOR)) return;
  event.preventDefault();
  event.stopPropagation();
};

export const MonthPicker: FC<Props> = ({
  monthsShown,
  onSelectDate,
  selectedDate,
  viewEnd,
  viewStart,
}) => {
  // A single-day window (Day view, or Week view squeezed to one column)
  // steps by day with Sunday-first columns; anything wider is a week view
  // and the cursor is a whole week row aligned to the view's start day.
  const isSingleDayWindow = viewStart.isSame(viewEnd, "day");
  const unit: MonthPickerUnit = isSingleDayWindow ? "day" : "week";
  const weekStartDay = isSingleDayWindow ? 0 : viewStart.day();

  const selectedDateKey = selectedDate.format(
    dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT,
  );
  // The cursor is re-derived when the parent's date moves, and also when the
  // window's start day changes (Shift+J/K can turn a Sunday-start window into
  // a Monday-start one), because the week anchor depends on both.
  const cursorSyncKey = `${selectedDateKey}|${unit}|${weekStartDay}`;
  const previousCursorSyncKeyRef = useRef(cursorSyncKey);
  const [focusedDate, setFocusedDate] = useState(() =>
    normalizePickerCursor(selectedDate, unit, weekStartDay),
  );
  const [displayedMonth, setDisplayedMonth] = useState(() =>
    selectedDate.startOf("month"),
  );
  // Bumped on explicit month jumps so react-datepicker remounts with its
  // internal cursor (the one tabindex=0 day) reset to `selected`. Arrow keys
  // move that cursor themselves and never remount.
  const [jumpGeneration, setJumpGeneration] = useState(0);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const restoreFocusRef = useRef<{ buttonLabel: string | null } | null>(null);

  const jumpToMonth = useCallback(
    (targetMonth: Dayjs) => {
      const active = document.activeElement;
      const fieldset = fieldsetRef.current;
      restoreFocusRef.current =
        fieldset && active instanceof HTMLElement && fieldset.contains(active)
          ? {
              buttonLabel:
                active.closest("button")?.getAttribute("aria-label") ?? null,
            }
          : null;

      setDisplayedMonth(targetMonth.startOf("month"));
      setFocusedDate((cursor) =>
        resolveMonthJumpCursor({ cursor, targetMonth, unit, weekStartDay }),
      );
      setJumpGeneration((generation) => generation + 1);
    },
    [unit, weekStartDay],
  );

  useMonthPickerShortcuts({
    onPrevMonth: () => jumpToMonth(displayedMonth.subtract(1, "month")),
    onNextMonth: () => jumpToMonth(displayedMonth.add(1, "month")),
  });

  // After a remount the previously focused element is gone. Put focus back on
  // the same header button, or on the new month's tab-stop day, but only when
  // the jump started inside the picker (chords fired from the grid stay put).
  useEffect(() => {
    if (jumpGeneration === 0) return;
    const restore = restoreFocusRef.current;
    restoreFocusRef.current = null;
    const fieldset = fieldsetRef.current;
    if (!restore || !fieldset) return;

    const target =
      (restore.buttonLabel
        ? fieldset.querySelector<HTMLElement>(
            `button[aria-label="${restore.buttonLabel}"]`,
          )
        : null) ?? fieldset.querySelector<HTMLElement>(TAB_STOP_DAY_SELECTOR);
    target?.focus({ preventScroll: true });
  }, [jumpGeneration]);

  useEffect(() => {
    if (previousCursorSyncKeyRef.current === cursorSyncKey) {
      return;
    }

    previousCursorSyncKeyRef.current = cursorSyncKey;
    const nextDate = dayjs(
      selectedDateKey,
      dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT,
    );
    setFocusedDate(normalizePickerCursor(nextDate, unit, weekStartDay));
    setDisplayedMonth(nextDate.startOf("month"));
  }, [cursorSyncKey, selectedDateKey, unit, weekStartDay]);

  const getDayClassName = (date: Date) =>
    getMonthPickerDayClassName({
      date: dayjs(date),
      selectedDate: focusedDate,
      selectedEnd: unit === "week" ? focusedDate.add(6, "day") : focusedDate,
      viewEnd,
      viewStart,
    });

  return (
    <fieldset
      ref={fieldsetRef}
      className={`c-month-picker ${monthPickerClassName}`}
      data-testid="Month picker"
      data-picker-unit={unit}
      data-pointer-action={POINTER_ACTIONS.datePick}
      aria-label="Date navigation"
      onClickCapture={swallowDayPointer}
      onMouseDownCapture={swallowDayPointer}
      {...pageJumpAttrs("month-picker")}
    >
      <MonthPickerHint unit={unit}>
        <DatePicker
          key={jumpGeneration}
          animationOnToggle={false}
          calendarClassName={ID_DATEPICKER_SIDEBAR}
          calendarStartDay={weekStartDay}
          dayClassName={getDayClassName}
          headerActionsClassName={headerActionsClassName}
          headerClassName="!relative !justify-start !px-0 !pb-3"
          headerEndContent={<TrialBadge />}
          inline
          isOpen={true}
          locale={monthPickerLocale(weekStartDay)}
          monthNav={{
            prevShortcut: MONTH_PICKER_PREV_KEYCAPS,
            nextShortcut: MONTH_PICKER_NEXT_KEYCAPS,
            onPrev: () => jumpToMonth(displayedMonth.subtract(1, "month")),
            onNext: () => jumpToMonth(displayedMonth.add(1, "month")),
            onToday: () => jumpToMonth(dayjs()),
          }}
          monthTextClassName="text-[14px] font-medium"
          monthsShown={monthsShown}
          onChange={(date) => {
            if (!date) return;

            const nextDate = normalizePickerCursor(
              dayjs(date),
              unit,
              weekStartDay,
            );

            setFocusedDate(nextDate);
            setDisplayedMonth(nextDate.startOf("month"));
            onSelectDate(nextDate);
          }}
          onMonthChange={(date) => {
            setDisplayedMonth(dayjs(date).startOf("month"));
          }}
          openToDate={displayedMonth.toDate()}
          selected={focusedDate.toDate()}
          shouldCloseOnSelect={false}
          showWeekPicker={unit === "week"}
          view="sidebar"
          withTodayButton={true}
        />
      </MonthPickerHint>
    </fieldset>
  );
};
