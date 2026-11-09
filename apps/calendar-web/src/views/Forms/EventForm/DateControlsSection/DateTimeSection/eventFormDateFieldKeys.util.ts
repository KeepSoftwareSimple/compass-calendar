import dayjs from "@core/util/date/dayjs";
import { parseUserDate } from "@web/common/utils/datetime/web.date.util";
import { type DatePickerClosedFieldKey } from "@web/components/DatePicker/date-picker-keys.util";
import { formatEventFormDateLabel } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/eventFormDateField.util";

const showsCommittedDay = (text: string, committedDate: Date) => {
  const parsed = parseUserDate(text.trim(), dayjs());
  return (
    parsed?.isSame(dayjs(committedDate), "day") === true &&
    text.trim() === formatEventFormDateLabel(committedDate)
  );
};

/** Closed-field keys (web `EventFormDateField.handleKeyDown`, Mac parity). */
export const closedFieldAction = (
  key: DatePickerClosedFieldKey,
  options: {
    shiftKey: boolean;
    modKey: boolean;
    text: string;
    committedDate: Date;
  },
):
  | { kind: "openCalendar" }
  | { kind: "nudgeDays"; days: number }
  | { kind: "ignore" } => {
  switch (key) {
    case "ArrowDown": {
      if (options.shiftKey) return { kind: "nudgeDays", days: 7 };
      if (options.modKey) return { kind: "nudgeDays", days: 1 };
      return { kind: "openCalendar" };
    }
    case "ArrowUp":
      return { kind: "nudgeDays", days: options.shiftKey ? -7 : -1 };
    case "Enter":
      if (options.modKey) return { kind: "ignore" };
      return showsCommittedDay(options.text, options.committedDate)
        ? { kind: "openCalendar" }
        : { kind: "ignore" };
    case " ":
      return options.text === formatEventFormDateLabel(options.committedDate)
        ? { kind: "openCalendar" }
        : { kind: "ignore" };
  }
};
