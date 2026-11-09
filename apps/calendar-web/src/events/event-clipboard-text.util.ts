import { type Event } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

/** Human-readable text for the system clipboard when an event is copied. */
export function formatEventClipboardText(event: Event): string {
  if (event.content.kind !== "details") {
    return "Compass event";
  }

  const title = event.content.title.trim() || "Untitled event";

  if (event.schedule.kind === "timed") {
    const zone = event.schedule.timeZone;
    const start = dayjs(event.schedule.start).tz(zone);
    const end = dayjs(event.schedule.end).tz(zone);
    const sameDay = start.isSame(end, "day");
    const dayLabel = start.format("ddd, MMM D");
    const range = sameDay
      ? `${start.format("h:mm A")} – ${end.format("h:mm A")}`
      : `${start.format("MMM D, h:mm A")} – ${end.format("MMM D, h:mm A")}`;
    return `${title}\n${dayLabel}, ${range} (${zone})`;
  }

  const start = dayjs(event.schedule.start).tz(getEffectiveTimeZone());
  const end = dayjs(event.schedule.end)
    .tz(getEffectiveTimeZone())
    .subtract(1, "day");
  const dayLabel = start.isSame(end, "day")
    ? start.format("ddd, MMM D")
    : `${start.format("MMM D")} – ${end.format("MMM D")}`;
  return `${title}\nAll day, ${dayLabel}`;
}
