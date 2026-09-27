import { Categories_Event } from "@web/common/types/web.event.types";
import { AllDayToggle } from "../AllDayToggle";
import {
  DateTimeSection,
  type Props as DateTimeSectionProps,
} from "../DateTimeSection/DateTimeSection";

interface Props {
  dateTimeSectionProps: DateTimeSectionProps;
  eventCategory: Categories_Event;
  onToggleAllDay: (checked: boolean) => void;
}

export const DateControlsSection = ({
  dateTimeSectionProps,
  eventCategory,
  onToggleAllDay,
}: Props) => {
  return (
    <div className="flex flex-col gap-2">
      <DateTimeSection {...dateTimeSectionProps} />
      <AllDayToggle
        checked={eventCategory === Categories_Event.ALLDAY}
        onChange={onToggleAllDay}
      />
    </div>
  );
};
