import { type Dispatch, type SetStateAction } from "react";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { EndsOnDate } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/components/EndsOnDate";
import { RecurrenceIntervalSelect } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/components/RecurrenceIntervalSelect";
import { RecurrenceToggle } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/components/RecurrenceToggle";
import { WeekDays } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/components/WeekDays";
import { recurrenceMinDateFromStart } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/recurrence-min-date";
import { useRecurrence } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/useRecurrence/useRecurrence";

export interface RecurrenceSectionProps {
  draft: GridEventDraft;
  setDraft: Dispatch<SetStateAction<GridEventDraft | null>>;
  seriesRules?: readonly string[];
}

// No auth/backend gate: anonymous (IndexedDB) mode stores the series record
// and expands occurrences at read time, and the signed-in backend-unavailable
// path falls back to that same local repository - recurrence works everywhere.
export function RecurrenceSection({
  draft,
  setDraft,
  seriesRules,
}: RecurrenceSectionProps) {
  const recurrenceHook = useRecurrence(draft, { setDraft }, seriesRules);
  const { setInterval, setFreq, setWeekDays, setUntil } = recurrenceHook;
  const { weekDays, interval, freq, until, toggleRecurrence } = recurrenceHook;
  const { hasRecurrence } = recurrenceHook;
  const recurrenceMinDate = recurrenceMinDateFromStart(
    draft.values.schedule.start,
  );

  return (
    <div className="flex w-full basis-full flex-col items-center gap-2 p-0">
      <RecurrenceToggle
        hasRecurrence={hasRecurrence}
        toggleRecurrence={toggleRecurrence}
      />

      {hasRecurrence && (
        <>
          <RecurrenceIntervalSelect
            initialValue={interval}
            frequency={freq}
            onChange={setInterval}
            onFreqSelect={setFreq}
            min={1}
            max={12}
          />

          <WeekDays value={weekDays} onChange={setWeekDays} />

          <EndsOnDate
            until={until}
            minDate={recurrenceMinDate}
            setUntil={setUntil}
          />
        </>
      )}
    </div>
  );
}
