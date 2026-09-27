import { type FC, useId, useState } from "react";
import dayjs from "@core/util/date/dayjs";
import { type SelectOption } from "@web/common/types/component.types";
import { type TimeOption } from "@web/common/types/util.types";
import {
  getTimeOptionByValue,
  getTimeOptions,
  tryMapToBackend,
} from "@web/common/utils/datetime/web.date.util";
import { shouldAdjustComplimentTime } from "@web/common/utils/datetime/web.datetime.util";
import { type OnEventFormScheduleChange } from "@web/views/Forms/EventForm/types";
import { TimePicker } from "./TimePicker";

export const END_TIME_ORDER_ERROR = "End time must be after start time";

const timeOptions = getTimeOptions();

interface Props {
  endTime: SelectOption<string>;
  onScheduleChange: OnEventFormScheduleChange;
  selectedEndDate: Date;
  selectedStartDate: Date;
  startTime: SelectOption<string>;
}

export const TimePickers: FC<Props> = ({
  endTime,
  onScheduleChange,
  selectedEndDate,
  selectedStartDate,
  startTime,
}) => {
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const [isEndMenuOpen, setIsEndMenuOpen] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const timeErrorId = useId();

  // shouldAdjustComplimentTime does its math on a fixed calendar-day anchor, so
  // a correction that crosses midnight lands on an adjacent day. Formatting it
  // back to a bare "h:mm A" drops that day, and pairing the wrapped time with an
  // unchanged date produced an inverted schedule that made mapToBackend throw an
  // unhandled ZodError. Return the day delta so the caller can shift the date
  // with it. Pure: the caller commits picker state only after the schedule
  // validates, so a leftover Zod failure cannot desync the form.
  const adjustComplimentTimeIfNeeded = (
    changed: "start" | "end",
    value: string,
  ): { option: TimeOption; dayOffset: number } => {
    const result = shouldAdjustComplimentTime(changed, {
      oldStart: startTime.value,
      start: changed === "start" ? value : startTime.value,
      oldEnd: endTime.value,
      end: changed === "end" ? value : endTime.value,
    });

    if (!result.shouldAdjust) {
      return {
        option: changed === "start" ? endTime : startTime,
        dayOffset: 0,
      };
    }

    const corrected =
      changed === "start"
        ? result.compliment.add(result.adjustment, "minutes")
        : result.compliment.subtract(result.adjustment, "minutes");
    const option = getTimeOptionByValue(corrected);
    const dayOffset = corrected
      .startOf("day")
      .diff(result.compliment.startOf("day"), "day");

    return { option, dayOffset };
  };

  const closeMenu = (changed: "start" | "end") => {
    (changed === "start" ? setIsStartMenuOpen : setIsEndMenuOpen)(false);
  };

  const rejectTimeSelection = (changed: "start" | "end") => {
    setTimeError(END_TIME_ORDER_ERROR);
    closeMenu(changed);
  };

  // One handler for both pickers: the picked side keeps its selected date and
  // the corrected compliment reduces to (picked time ± duration), so it is
  // anchored to the picked side's date and the midnight day-carry applies to
  // the compliment. Same-day inverted clocks use that shift instead of an
  // order error. Anchoring the compliment to its own selected date instead
  // would double-count the span of a draft that already crosses midnight.
  const onTimeSelected = (
    changed: "start" | "end",
    option: SelectOption<string>,
  ) => {
    const prior = changed === "start" ? startTime : endTime;
    if (!prior.value || prior.value === option.value) {
      setTimeError(null);
      closeMenu(changed);
      return;
    }

    const { option: corrected, dayOffset } = adjustComplimentTimeIfNeeded(
      changed,
      option.value,
    );

    const anchorDate =
      changed === "start" ? selectedStartDate : selectedEndDate;
    const complimentDate = dayjs(anchorDate).add(dayOffset, "day").toDate();

    const mapped = tryMapToBackend({
      startDate: changed === "start" ? anchorDate : complimentDate,
      endDate: changed === "start" ? complimentDate : anchorDate,
      startTime: changed === "start" ? option : corrected,
      endTime: changed === "start" ? corrected : option,
      isAllDay: false,
    });

    if (!mapped.ok) {
      rejectTimeSelection(changed);
      return;
    }

    setTimeError(null);

    // TS guard: isAllDay: false above always yields "timed".
    if (mapped.schedule.kind === "timed") {
      onScheduleChange({
        kind: "timed",
        start: dayjs(mapped.schedule.start).toDate(),
        end: dayjs(mapped.schedule.end).toDate(),
        timeZone: mapped.schedule.timeZone,
      });
    }
    closeMenu(changed);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center">
        <TimePicker
          aria-label="Start time"
          inputId="startTimePicker"
          isMenuOpen={isStartMenuOpen}
          onChange={(option) => onTimeSelected("start", option)}
          openMenuOnFocus
          options={timeOptions}
          setIsMenuOpen={setIsStartMenuOpen}
          value={startTime}
        />
        -
        <TimePicker
          aria-describedby={timeError ? timeErrorId : undefined}
          aria-invalid={timeError ? true : undefined}
          aria-label="End time"
          inputId="endTimePicker"
          isMenuOpen={isEndMenuOpen}
          onChange={(option) => onTimeSelected("end", option)}
          openMenuOnFocus
          options={timeOptions}
          setIsMenuOpen={setIsEndMenuOpen}
          value={endTime}
        />
      </div>
      {timeError ? (
        <p className="text-error text-xs" id={timeErrorId} role="alert">
          {timeError}
        </p>
      ) : null}
    </div>
  );
};
