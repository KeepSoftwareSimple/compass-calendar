import { ObjectId } from "bson";
import { GCAL_MAX_RECURRENCES } from "@core/constants/core.constants";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { CompassEventRRule } from "@core/util/event/compass.event.rrule";
import { getCompassEventDateFormat } from "@core/util/event/event.util";
import { type GridEvent } from "@web/common/types/web.event.types";

/**
 * Expand a recurring timed draft into read-only preview occurrences that fall
 * within the visible week, so the user sees the full effect of the recurrence
 * before saving. The interactive draft still renders its own occurrence; these
 * are the *other* days.
 *
 * Occurrences run forward from the draft's start (the series' first instance)
 * through the end of the view — the same instances the saved event would have.
 * We deliberately don't backfill days before the draft's start, because the
 * saved series wouldn't exist there either; the preview reflects that reality.
 *
 * Derived from the draft on every render (no stored state), so discarding the
 * draft clears the previews for free and dragging/editing it updates them.
 * Returns [] for non-recurring drafts and for all-day drafts (previewed
 * separately by the all-day row).
 */
export const getRecurringDraftPreviews = (
  draft: GridEvent | null,
  startOfView: Dayjs,
  endOfView: Dayjs,
): GridEvent[] => {
  const rule = draft?.recurrence?.rule;

  if (
    !draft ||
    draft.isAllDay ||
    !draft.startDate ||
    !draft.endDate ||
    !Array.isArray(rule) ||
    rule.length === 0
  ) {
    return [];
  }

  try {
    const rrule = new CompassEventRRule({
      _id: new ObjectId(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      recurrence: { rule },
    });

    const format = getCompassEventDateFormat(draft.startDate);
    const durationMs = dayjs(draft.endDate).diff(
      draft.startDate,
      "milliseconds",
    );
    const endBoundary = endOfView.endOf("day");
    const startBoundary = startOfView.startOf("day");
    const draftDayKey = dayjs(draft.startDate).format(YEAR_MONTH_DAY_FORMAT);

    return rrule
      .all(
        (date, index) =>
          index < GCAL_MAX_RECURRENCES && dayjs(date).isBefore(endBoundary),
      )
      .filter((date) => {
        const occurrence = dayjs(date);
        return (
          !occurrence.isBefore(startBoundary) &&
          occurrence.format(YEAR_MONTH_DAY_FORMAT) !== draftDayKey
        );
      })
      .map((date) => {
        const start = dayjs(date);
        return {
          ...draft,
          // No id: these are inert previews, not events, and must not be
          // hover-tracked or keyed off the draft.
          _id: undefined,
          startDate: start.format(format),
          endDate: start.add(durationMs, "milliseconds").format(format),
        };
      });
  } catch {
    return [];
  }
};
