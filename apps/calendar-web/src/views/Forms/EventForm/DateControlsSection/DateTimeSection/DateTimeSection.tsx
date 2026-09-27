import { type FC } from "react";
import { type SelectOption } from "@web/common/types/component.types";
import { Categories_Event } from "@web/common/types/web.event.types";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { DatePickers } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/DatePickers/DatePickers";
import { TimePickers } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/TimePicker/TimePickers";
import { type OnEventFormScheduleChange } from "@web/views/Forms/EventForm/types";

export interface Props {
  category: Categories_Event;
  displayEndDate: Date;
  draft: GridEventDraft;
  endTime: SelectOption<string>;
  isEndDatePickerOpen: boolean;
  isStartDatePickerOpen: boolean;
  onScheduleChange: OnEventFormScheduleChange;
  selectedEndDate: Date;
  selectedStartDate: Date;
  setIsEndDatePickerOpen: (arg0: boolean) => void;
  setIsStartDatePickerOpen: (arg0: boolean) => void;
  startTime: SelectOption<string>;
}

export const DateTimeSection: FC<Props> = ({
  category,
  displayEndDate,
  draft,
  isEndDatePickerOpen,
  isStartDatePickerOpen,
  selectedEndDate,
  selectedStartDate,
  onScheduleChange,
  setIsStartDatePickerOpen,
  setIsEndDatePickerOpen,
  startTime,
  endTime,
}) => {
  return (
    <div className="flex items-center gap-2">
      {category === Categories_Event.ALLDAY && (
        <DatePickers
          displayEndDate={displayEndDate}
          draft={draft}
          isEndDatePickerOpen={isEndDatePickerOpen}
          isStartDatePickerOpen={isStartDatePickerOpen}
          selectedEndDate={selectedEndDate}
          selectedStartDate={selectedStartDate}
          onScheduleChange={onScheduleChange}
          setIsEndDatePickerOpen={setIsEndDatePickerOpen}
          setIsStartDatePickerOpen={setIsStartDatePickerOpen}
        />
      )}

      {category === Categories_Event.TIMED && (
        <TimePickers
          endTime={endTime}
          onScheduleChange={onScheduleChange}
          startTime={startTime}
          selectedEndDate={selectedEndDate}
          selectedStartDate={selectedStartDate}
        />
      )}
    </div>
  );
};
