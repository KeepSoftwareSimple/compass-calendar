import { type CompassEvent } from "@core/types/compass-event.contracts";
import dayjs from "@core/util/date/dayjs";

export const freshenEventStartEndDate = (event: CompassEvent): CompassEvent => {
  // Set event to start on the current week's Thursday at 11am and end at 12pm (timed event)
  const now = dayjs();
  const startOfWeek = now.startOf("week"); // Sunday
  const thursday = startOfWeek.add(4, "day"); // Thursday
  const newStartDate = thursday
    .hour(11)
    .minute(0)
    .second(0)
    .millisecond(0)
    .format();
  const newEndDate = thursday
    .hour(12)
    .minute(0)
    .second(0)
    .millisecond(0)
    .format();
  return { ...event, startDate: newStartDate, endDate: newEndDate };
};
