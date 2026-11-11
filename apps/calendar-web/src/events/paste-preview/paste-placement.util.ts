import { type Calendar } from "@core/types/calendar.contracts";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { roundToNext } from "@web/common/utils/round/round.util";
import {
  type GridEventDraft,
  type GridScheduleDraft,
} from "@web/events/event-draft.types";
import {
  duplicateGridEventDraft,
  replaceGridDraftSchedule,
} from "@web/events/grid-event-draft.adapter";
import { GRID_TIME_STEP } from "@web/grid/grid.constants";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

/** Duplicate draft for paste placement, starting just after the source event. */
export function duplicateDraftForPastePlacement(
  source: Event,
  calendars: Calendar[],
): GridEventDraft | null {
  const duplicate = duplicateGridEventDraft(source, calendars);
  if (!duplicate) return null;

  const schedule = initialPasteSchedule(source);
  const clientId = EventIdSchema.parse(createObjectIdString());
  const placed = replaceGridDraftSchedule({ ...duplicate, clientId }, schedule);
  return placed;
}

function initialPasteSchedule(source: Event): GridScheduleDraft {
  if (source.schedule.kind === "timed") {
    const end = dayjs(source.schedule.end).tz(source.schedule.timeZone);
    const durationMin = end.diff(source.schedule.start, "minute");
    const startMinutes = end.hour() * 60 + end.minute();
    const snappedStartMinutes = roundToNext(startMinutes, GRID_TIME_STEP);
    const snappedStart = end.startOf("day").add(snappedStartMinutes, "minute");
    let snappedEnd = snappedStart.add(durationMin, "minute");
    if (!snappedEnd.isAfter(snappedStart)) {
      snappedEnd = snappedStart.add(GRID_TIME_STEP, "minute");
    }
    return {
      kind: "timed",
      start: snappedStart.toDate(),
      end: snappedEnd.toDate(),
      timeZone: source.schedule.timeZone,
    };
  }

  const start = inEffectiveTimeZone(source.schedule.end).startOf("day");
  const sourceStart = inEffectiveTimeZone(source.schedule.start).startOf("day");
  const daySpan = Math.max(1, start.diff(sourceStart, "day"));
  return {
    kind: "allDay",
    start: start.toDate(),
    end: start.add(daySpan, "day").toDate(),
  };
}
