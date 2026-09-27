import type React from "react";
import { type FC } from "react";
import { MONTH_DAY_YEAR } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import { dateIsValid } from "@web/common/utils/datetime/web.date.util";
import { shouldAdjustComplimentDate } from "@web/common/utils/datetime/web.datetime.util";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { DatePicker } from "@web/components/DatePicker/DatePicker";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { type OnEventFormScheduleChange } from "@web/views/Forms/EventForm/types";

const stopPropagation = (e: React.MouseEvent<HTMLDivElement>) => {
  e.stopPropagation();
};

// The start and end date pickers share one row inside a narrow sidebar card.
// react-datepicker's wrapper/input-container are inline-block and size to the
// input's fixed width, so two of them overflow the card and the end date spills
// past its right edge. flex-1 + min-w-0 lets each field shrink to stay inside
// the card (max-w-28 keeps them compact on a wide sidebar); forcing the whole
// react-datepicker chain to fill the field is what lets the shrink reach the
// input instead of stopping at the inline-block wrappers.
const dateFieldClassName =
  "flex min-w-0 max-w-28 flex-1 items-center [&_.react-datepicker-wrapper]:w-full [&_.react-datepicker\\_\\_input-container]:w-full [&_input]:w-full [&_input]:min-w-0";

interface Props {
  displayEndDate: Date;
  draft: GridEventDraft;
  isEndDatePickerOpen: boolean;
  isStartDatePickerOpen: boolean;
  selectedEndDate: Date;
  selectedStartDate: Date;
  onScheduleChange: OnEventFormScheduleChange;
  setIsStartDatePickerOpen: (arg0: boolean) => void;
  setIsEndDatePickerOpen: (arg0: boolean) => void;
}

export const DatePickers: FC<Props> = ({
  displayEndDate,
  draft,
  isEndDatePickerOpen,
  isStartDatePickerOpen,
  selectedEndDate,
  selectedStartDate,
  onScheduleChange,
  setIsEndDatePickerOpen,
  setIsStartDatePickerOpen,
}) => {
  const closeEndDatePicker = () => {
    setIsEndDatePickerOpen(false);
  };

  const closeStartDatePicker = () => {
    setIsStartDatePickerOpen(false);
  };

  const getDateFromInput = (val: string) => {
    const date = dayjs(val, MONTH_DAY_YEAR).toDate();
    return date;
  };

  const onPickerKeyDown = (
    picker: "start" | "end",
    e: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    switch (true) {
      case e.key === "Backspace": {
        e.stopPropagation();
        break;
      }
      // Combobox convention: ArrowDown on the closed input opens the
      // calendar, matching what onInputClick does for the mouse.
      case e.key === "ArrowDown": {
        const isOpen =
          picker === "start" ? isStartDatePickerOpen : isEndDatePickerOpen;
        if (isOpen) break;

        e.preventDefault();
        e.stopPropagation();
        if (picker === "start") {
          setIsEndDatePickerOpen(false);
          setIsStartDatePickerOpen(true);
        } else {
          setIsStartDatePickerOpen(false);
          setIsEndDatePickerOpen(true);
        }
        break;
      }
      case e.key === "Enter": {
        e.stopPropagation();
        e.preventDefault();

        const input = e.target as HTMLInputElement;
        const val = input.value;
        const isInvalid = val !== undefined && !dateIsValid(val);

        if (isInvalid) {
          showErrorToast(
            `Sorry, IDK what to do with a ${picker} date of '${val}'. Make sure it's in '${MONTH_DAY_YEAR}' and try again`,
          );
          return;
        }

        const date = getDateFromInput(val);

        if (picker === "start") {
          onSelectStartDate(date);
        }

        if (picker === "end") {
          onSelectEndDate(date);
        }

        break;
      }
      case e.key === "Escape": {
        if (isStartDatePickerOpen) {
          e.stopPropagation();
          closeStartDatePicker();
        }
        if (isEndDatePickerOpen) {
          e.stopPropagation();
          closeEndDatePicker();
        }
        break;
      }
      case e.key === "Tab": {
        if (isStartDatePickerOpen) {
          setIsStartDatePickerOpen(false);
        }
        if (isEndDatePickerOpen) {
          setIsEndDatePickerOpen(false);
        }
        break;
      }
      default: {
        return;
      }
    }
  };

  const formatDate = (date: Date) => {
    return dayjs(date).format(dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT);
  };

  const toAllDayDate = (date: Date) => dayjs(formatDate(date)).toDate();

  const currentAllDayBounds = () => {
    const { schedule } = draft.values;
    if (schedule.kind === "allDay") {
      return { start: schedule.start, end: schedule.end };
    }
    return { start: selectedStartDate, end: selectedEndDate };
  };

  const onSelectStartDate = (start: Date) => {
    setIsStartDatePickerOpen(false);

    const { shouldAdjust: shouldAdjustEnd, compliment } =
      shouldAdjustComplimentDate("start", {
        start,
        end: selectedEndDate,
      });

    if (shouldAdjustEnd) {
      // Given an all-day event that starts and ends on December 25,
      // the event form should show a start of "2025-12-25" and an end of "2025-12-25",
      // and the backend should store the start as "2025-12-25" and the end as "2025-12-26".
      // Adding one day to the end here helps us achieve that requirement.
      onScheduleChange({
        kind: "allDay",
        start: toAllDayDate(start),
        end: toAllDayDate(compliment),
      });
    } else {
      onScheduleChange({
        kind: "allDay",
        start: toAllDayDate(start),
        end: currentAllDayBounds().end,
      });
    }
  };

  const onSelectEndDate = (end: Date) => {
    setIsEndDatePickerOpen(false);

    const { shouldAdjust, compliment } = shouldAdjustComplimentDate("end", {
      start: selectedStartDate,
      end,
    });

    if (shouldAdjust) {
      onScheduleChange({
        kind: "allDay",
        start: toAllDayDate(compliment),
        end: toAllDayDate(compliment),
      });
    } else {
      onScheduleChange({
        kind: "allDay",
        start: currentAllDayBounds().start,
        end: toAllDayDate(dayjs(end).add(1, "day").toDate()),
      });
    }
  };

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: This wrapper only stops date picker mouse events from bubbling to the form. */}
      <div
        className={dateFieldClassName}
        onMouseUp={stopPropagation}
        onMouseDown={stopPropagation}
      >
        <DatePicker
          calendarClassName="startDatePicker"
          isOpen={isStartDatePickerOpen}
          monthTextClassName="text-medium"
          onCalendarClose={closeStartDatePicker}
          onCalendarOpen={() => {
            setIsStartDatePickerOpen(true);
          }}
          onChange={() => null}
          onInputClick={() => {
            if (isEndDatePickerOpen) {
              setIsEndDatePickerOpen(false);
            }
            setIsStartDatePickerOpen(true);
          }}
          onKeyDown={(e) => onPickerKeyDown("start", e)}
          onSelect={onSelectStartDate}
          selected={selectedStartDate}
          title="Pick Start Date"
          view="grid"
        />
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: This wrapper only stops date picker mouse events from bubbling to the form. */}
      <div
        className={dateFieldClassName}
        onMouseUp={stopPropagation}
        onMouseDown={stopPropagation}
      >
        <DatePicker
          calendarClassName="endDatePicker"
          isOpen={isEndDatePickerOpen}
          monthTextClassName="text-medium"
          onCalendarClose={closeEndDatePicker}
          onCalendarOpen={() => setIsEndDatePickerOpen(true)}
          onChange={() => null}
          onInputClick={() => {
            if (isStartDatePickerOpen) {
              setIsStartDatePickerOpen(false);
            }
            setIsEndDatePickerOpen(true);
          }}
          onKeyDown={(e) => onPickerKeyDown("end", e)}
          onSelect={onSelectEndDate}
          selected={displayEndDate}
          title="Pick End Date"
          view="grid"
        />
      </div>
    </>
  );
};
