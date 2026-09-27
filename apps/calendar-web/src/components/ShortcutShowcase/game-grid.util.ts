import { HOURS_AM_SHORT_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";

export const formatGridHour = (hour: number) =>
  dayjs().startOf("day").add(hour, "hour").format(HOURS_AM_SHORT_FORMAT);

export const gridOffsetPercent = (
  startMin: number,
  gridStartMin: number,
  totalMin: number,
) => `${((startMin - gridStartMin) / totalMin) * 100}%`;

export const percentBlockStyle = (
  startMin: number,
  durationMin: number,
  gridStartMin: number,
  totalMin: number,
) => ({
  top: gridOffsetPercent(startMin, gridStartMin, totalMin),
  height: `${(durationMin / totalMin) * 100}%`,
});
