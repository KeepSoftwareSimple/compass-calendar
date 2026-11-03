import { type FC } from "react";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { scheduleTimeZoneFromDraft } from "@web/events/grid-event-draft.adapter";
import { eventFormScheduleTimeZoneHintText } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/event-form-schedule-timezone-hint.util";

interface Props {
  draft: GridEventDraft;
}

export const EventFormScheduleTimeZoneHint: FC<Props> = ({ draft }) => {
  const schedule = draft.values.schedule;
  if (schedule.kind !== "timed") return null;

  const hint = eventFormScheduleTimeZoneHintText(
    scheduleTimeZoneFromDraft(draft),
    schedule.start,
    schedule.end,
  );
  if (!hint) return null;

  return <p className="text-text-muted text-xs">{hint}</p>;
};
