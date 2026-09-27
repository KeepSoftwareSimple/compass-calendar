import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId, EventIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { focusCalendarEventElement } from "@web/common/utils/event/event.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  duplicateGridEventDraft,
  parseGridEventDraft,
} from "@web/events/grid-event-draft.adapter";
import { type EventMutations } from "@web/events/mutations/useEventMutations";

/**
 * Duplicates `source` as a saved event in one commit, skipping the create
 * draft/form entirely: every field is already filled in, so the form would
 * only be a step to dismiss. Focuses the new card so Shift+Arrow can
 * reposition it immediately, and undo (Mod+Z) covers the whole thing since
 * `create` records its own undo entry.
 *
 * Returns false when no writable calendar can be resolved (duplicating from
 * a read-only calendar with no default target) - the one case that still
 * needs the form, so the caller can fall back to opening it.
 */
export function commitDuplicateEvent({
  source,
  calendars,
  defaultCalendarId,
  create,
}: {
  source: Event;
  calendars: Calendar[];
  defaultCalendarId: CalendarId | undefined;
  create: EventMutations["create"];
}): boolean {
  const draft = duplicateGridEventDraft(source, calendars);
  if (!draft) return false;

  const calendarId = draft.values.calendarId ?? defaultCalendarId ?? null;
  if (!calendarId) return false;

  const parsed = parseGridEventDraft({
    ...draft,
    values: { ...draft.values, calendarId },
  });
  if (!parsed.ok || parsed.mode !== "create") return false;

  const id = EventIdSchema.parse(createObjectIdString());

  create(
    { ...parsed.input, id },
    { onOptimisticApplied: () => focusCalendarEventElement(id) },
  );

  return true;
}
