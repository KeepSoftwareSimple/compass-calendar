import type dayjs from "@core/util/date/dayjs";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";

/**
 * A day's event query range as `[startDate, endDate)`: `endDate` is the next
 * calendar day's start, not this day's end, so all-day events spanning only
 * this single day still fall within the range's exclusive upper bound.
 *
 * Bounds keep their local UTC offset (like the week query) so they are real
 * local-midnight instants; relabeling them as UTC shifts the window by the
 * offset and drops evening events.
 *
 * Kept in its own dependency-free module (no React import) so the route
 * loader's prefetch can pull it in without dragging the Day view's hook
 * closure into the eager boot bundle.
 */
export const dayEventQueryRange = (date: dayjs.Dayjs) => ({
  startDate: toUTCOffset(date.startOf("day")),
  endDate: toUTCOffset(date.add(1, "day").startOf("day")),
});
