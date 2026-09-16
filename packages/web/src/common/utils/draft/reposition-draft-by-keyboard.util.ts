import {
  type EventNudgeStep,
  getArrowKeyMovement,
  isTimedEventInsideOneDay,
} from "@web/common/utils/event/event-nudge.util";
import {
  type GridEventDraft,
  type GridScheduleDraft,
} from "@web/events/event-draft.types";
import { replaceGridDraftSchedule } from "@web/events/grid-event-draft.adapter";
import { type Activity_DraftEvent } from "@web/events/stores/draft.store";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

const canRepositionDraftByKeyboard = (
  activity: Activity_DraftEvent | null | undefined,
) =>
  activity === "createShortcut" ||
  activity === "gridClick" ||
  activity === "keyboardEdit" ||
  activity === "keyboardPlace";

/**
 * Moves a draft by one arrow step. Returns the updated draft when the move
 * applies, otherwise null. Callers own persistence and any day-follow
 * navigation (Day) or visible-range clamping (Week).
 */
export const repositionDraftByKeyboard = ({
  activity,
  draft,
  key,
  isStartAllowed,
  step = "fine",
}: {
  activity: Activity_DraftEvent | null | undefined;
  draft: GridEventDraft | null | undefined;
  key: string;
  /** Optional bound for the draft's next start (e.g. Week visible range). */
  isStartAllowed?: (nextStart: Date) => boolean;
  step?: EventNudgeStep;
}): GridEventDraft | null => {
  if (!canRepositionDraftByKeyboard(activity) || !draft) return null;

  const isAllDay = draft.values.schedule.kind === "allDay";
  const movement = getArrowKeyMovement(key, isAllDay, step);
  if (!movement) return null;

  const start = inEffectiveTimeZone(draft.values.schedule.start);
  const end = inEffectiveTimeZone(draft.values.schedule.end);
  const nextStart = start
    .add(movement.days, "day")
    .add(movement.minutes, "minutes");
  const nextEnd = end
    .add(movement.days, "day")
    .add(movement.minutes, "minutes");

  if (isStartAllowed && !isStartAllowed(nextStart.toDate())) return null;

  if (!isAllDay && !isTimedEventInsideOneDay(nextStart, nextEnd)) {
    return null;
  }

  const schedule: GridScheduleDraft = isAllDay
    ? { kind: "allDay", start: nextStart.toDate(), end: nextEnd.toDate() }
    : {
        ...draft.values.schedule,
        start: nextStart.toDate(),
        end: nextEnd.toDate(),
      };

  return replaceGridDraftSchedule(draft, schedule);
};
