import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { setCalendarVisibility } from "@web/calendars/calendar-visibility.store";
import { calendarVisibilityStatusMessage } from "@web/calendars/useCalendarVisibility";
import {
  CALENDAR_VISIBILITY_TOAST_ID,
  UNDO_DECLINED_TOAST_ID,
  UNDO_STATUS_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { focusCalendarEventElement } from "@web/common/utils/event/event.util";
import {
  showRestoredToast,
  showRestoreFailedToast,
} from "@web/common/utils/toast/deleted-toast.util";
import { dismissRecurrenceScopeToastFor } from "@web/common/utils/toast/recurrence-scope.toast";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { detailsLocation } from "@web/events/grid-event-draft.adapter";
import { useToggleEventHidden } from "@web/events/hidden/hidden-events.query";
import { selfAttendeeResponseStatus } from "@web/events/mutations/event.mutation-history";
import {
  type EventMutationCallbacks,
  type EventMutationDependencies,
  useEventMutations,
} from "@web/events/mutations/useEventMutations";
import {
  eventBelongsToEntry,
  findEventInCache,
  upsertEventAcrossQueries,
} from "@web/events/queries/event.query.cache";
import {
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import {
  runHistoryRestore,
  selectCanRedo,
  selectCanUndo,
  type UndoHistoryEntry,
  undoHistoryActions,
  useUndoHistoryStore,
} from "@web/events/stores/undo.store";

const isCreateEntry = (
  entry: UndoHistoryEntry,
): entry is Extract<UndoHistoryEntry, { kind: "create" }> =>
  entry.kind === "create";

const isDeleteEntry = (
  entry: UndoHistoryEntry,
): entry is Extract<UndoHistoryEntry, { kind: "delete" }> =>
  entry.kind === "delete";

const isHiddenEntry = (
  entry: UndoHistoryEntry,
): entry is Extract<UndoHistoryEntry, { kind: "hidden" }> =>
  entry.kind === "hidden";

const isCalendarVisibilityEntry = (
  entry: UndoHistoryEntry,
): entry is Extract<UndoHistoryEntry, { kind: "calendarVisibility" }> =>
  entry.kind === "calendarVisibility";

const isRsvpEntry = (
  entry: UndoHistoryEntry,
): entry is Extract<UndoHistoryEntry, { kind: "rsvp" }> =>
  entry.kind === "rsvp";

const isUnrecordedEntry = (
  entry: UndoHistoryEntry,
): entry is Extract<UndoHistoryEntry, { kind: "unrecorded" }> =>
  entry.kind === "unrecorded";

const replayCalendarVisibility = (
  isVisible: boolean,
  calendarId: Extract<
    UndoHistoryEntry,
    { kind: "calendarVisibility" }
  >["calendarId"],
  label: string,
) => {
  if (!setCalendarVisibility(calendarId, isVisible)) return;
  showStatusToast(
    CALENDAR_VISIBILITY_TOAST_ID,
    calendarVisibilityStatusMessage(isVisible, label),
  );
};

const entryEventId = (entry: UndoHistoryEntry): string | null => {
  if (isDeleteEntry(entry) || isCreateEntry(entry)) return entry.event.id;
  if (entry.kind === "edit" || isRsvpEntry(entry)) return entry.id;
  if (isHiddenEntry(entry)) return entry.eventId;
  return null;
};

// Edit replays keep the same React key (in-place update); delete-undo may
// need a frame or two for the card to remount. `focusCalendarEventElement`
// covers both — unlike `refocusEventElement`, which waits for a replaced node.

const showUndoDeclinedToast = () =>
  showStatusToast(UNDO_DECLINED_TOAST_ID, "Can't undo. Event changed since");

// A snapshot recorded before this event was ever replayed may omit `location`
// or `color` entirely (an older local record, a demo-seeded event built
// outside the normal create mutation, or any Event built without them) —
// replaying always fills `location` in (replaySnapshot below), since the
// editable-content contract requires a definite string, and the rest of the
// app treats a missing `color` the same as `color: null` (see
// grid-event-draft.adapter.ts's `color: event.content.color ?? null`).
// Comparing raw JSON.stringify output would then read "gained a location/
// color key" as an external change. Normalizing both sides the same way
// keeps the comparison about the actual value, not whether the key happened
// to be present.
const normalizedDetailsContent = (content: Event["content"]) =>
  content.kind === "details"
    ? {
        ...content,
        location: detailsLocation(content),
        color: content.color ?? null,
      }
    : content;

// Whether `current` still matches the state an undo/redo entry expects to
// find before it replays — the staleness guard. Deliberately narrow: it
// compares only the fields our own snapshots capture and our own replays
// write (calendar, content, schedule), not id/recurrence-linkage/timestamps,
// which our own replay writes always touch regardless of external activity.
// A mismatch means something ELSE (an SSE-driven refetch, another tab, a
// Google-side edit) changed the event since this entry was recorded, and
// blindly replaying the snapshot would silently clobber it — last-write-wins
// with no warning. Declining is the safe failure mode; the caller surfaces a
// toast instead of applying stale data.
function snapshotMatches(current: Event, expected: Event): boolean {
  if (current.calendarId !== expected.calendarId) return false;
  if (
    JSON.stringify(normalizedDetailsContent(current.content)) !==
    JSON.stringify(normalizedDetailsContent(expected.content))
  ) {
    return false;
  }
  return JSON.stringify(current.schedule) === JSON.stringify(expected.schedule);
}

/**
 * Replays undo history through the regular event mutations. Edits are
 * symmetric `replace` replays of the full before/after snapshots; deletes of
 * a single event are undone by recreating the snapshot under its original id
 * (A25), which resurrects the same provider-linked event server-side; a
 * recurring occurrence's delete is undone by replaying its snapshot back
 * (un-cancelling the tombstone) instead, since "create" would spawn a
 * duplicate standalone event rather than restore the instance; creates are
 * undone by deleting the optimistic event (scope "all" for a series, "this"
 * for a single) and redone by recreating it with the same recurrence.
 *
 * Every replay first checks snapshotMatches against the live cache — see its
 * docblock — and declines with a toast rather than clobbering when the event
 * has moved on since this entry was recorded.
 */
export function useUndoRedo(dependencies: EventMutationDependencies = {}) {
  const mutations = useEventMutations(dependencies);
  const { setEventHidden } = useToggleEventHidden();
  const queryClient = useQueryClient();
  const activeSource = useEventRepositorySource();
  const source = dependencies.source ?? activeSource;
  const canUndo = useUndoHistoryStore(selectCanUndo);
  const canRedo = useUndoHistoryStore(selectCanRedo);

  // History only ever records events whose content is "details" (a
  // busy-provider event is never user-edited through our mutations), so a
  // snapshot's content is always safe to replay as-is.
  const replaySnapshot = useCallback(
    (id: EventId, snapshot: Event, callbacks?: EventMutationCallbacks) => {
      if (snapshot.content.kind !== "details") return;
      mutations.replace(
        {
          id,
          input: {
            // Restores the snapshot's calendar too, so undoing a cross-calendar
            // move puts the event back on its original calendar.
            calendarId: snapshot.calendarId,
            // The wire boundary in useEventMutations strips this back to the
            // editable subset before it reaches the server; kept full here so
            // the optimistic merge above doesn't drop organizer/attendees/
            // conference until the settle refetch.
            content: {
              ...snapshot.content,
              location: detailsLocation(snapshot.content),
            },
            schedule: snapshot.schedule,
            // "preserve" keeps whatever recurrence linkage the target already
            // has (single, or one occurrence of a series) — scope "this"
            // never changes that linkage server-side regardless of what's
            // sent, so this is both correct and recurrence-agnostic.
            recurrence: { kind: "preserve" },
            scope: "this",
            // Every replaySnapshot call is a replay (undo/redo of an edit, or
            // un-cancelling an occurrence's delete tombstone below) — never a
            // normal user edit, which goes through useSaveEventForm instead.
            // See CreateEventInputSchema.restore's comment for why this
            // matters: it's what lets a collision with an earlier terminal
            // command on the same key be reopened instead of no-op'd.
            restore: true,
          },
        },
        callbacks,
      );
    },
    [mutations],
  );

  // Undo of a delete: a single event is recreated; a recurring occurrence is
  // instead replayed back via replace (un-cancelling its tombstone) — see
  // the module docblock for why "create" is wrong there. replace's own
  // optimistic callback only merges onto an event ALREADY in cache (it reads
  // `existing` and no-ops when absent), but a just-deleted occurrence isn't
  // — so this seeds the cache with the full snapshot first, the same insert
  // a create's optimistic callback would do, before the replace mutation
  // (whose own optimistic merge then finds it and is a harmless no-op
  // overwrite) carries it to the server.
  const undoDelete = useCallback(
    (event: Event, callbacks?: EventMutationCallbacks) => {
      if (event.content.kind !== "details") return;
      if (event.recurrence.kind === "occurrence") {
        upsertEventAcrossQueries(
          queryClient,
          event,
          (entry) => eventBelongsToEntry(event, entry, source),
          { source },
        );
        replaySnapshot(event.id as EventId, event, callbacks);
        return;
      }
      mutations.create(
        {
          id: event.id,
          calendarId: event.calendarId,
          content: {
            ...event.content,
            location: detailsLocation(event.content),
          },
          schedule: event.schedule,
          recurrence:
            event.recurrence.kind === "series"
              ? { kind: "series", rules: event.recurrence.rules }
              : { kind: "single" },
          restore: true,
        },
        callbacks,
      );
    },
    [queryClient, source, mutations, replaySnapshot],
  );

  // Undo of a create: delete the whole series for a series create (its own
  // id has no `::` occurrence separator, so scope barely matters
  // server-side, but "all" states the intent honestly), "this" otherwise.
  const undoCreate = useCallback(
    (event: Event) => {
      mutations.delete({
        id: event.id as EventId,
        scope: event.recurrence.kind === "series" ? "all" : "this",
      });
    },
    [mutations],
  );

  const undo = useCallback(() => {
    const entry = undoHistoryActions.peekUndo();
    if (!entry) {
      showStatusToast(UNDO_STATUS_TOAST_ID, "Nothing to undo");
      return;
    }

    if (isUnrecordedEntry(entry)) {
      undoHistoryActions.dropTopUndo();
      showStatusToast(UNDO_STATUS_TOAST_ID, "Can't undo the last change");
      return;
    }

    // Remove a promotion affordance only when undoing its own narrow action.
    // Undoing a later, unrelated event must leave the earlier opportunity live.
    const opportunity =
      useRecurrenceScopeOpportunityStore.getState().opportunity;
    const targetEventId = entryEventId(entry);
    if (
      opportunity?.source === source &&
      targetEventId !== null &&
      opportunity.original.id === targetEventId
    ) {
      recurrenceScopeOpportunityActions.clear();
      dismissRecurrenceScopeToastFor(opportunity);
    }

    if (entry.kind === "edit") {
      const current = findEventInCache(queryClient, entry.id, source);
      // No cached copy to compare against (outside the loaded range) — fail
      // open, matching prior best-effort behavior; there's nothing to detect
      // staleness against.
      if (current && !snapshotMatches(current, entry.after)) {
        undoHistoryActions.dropTopUndo();
        showUndoDeclinedToast();
        return;
      }
    }

    if (isRsvpEntry(entry)) {
      const current = findEventInCache(queryClient, entry.id, source);
      if (
        current &&
        selfAttendeeResponseStatus(current, entry.accountEmail) !== entry.after
      ) {
        undoHistoryActions.dropTopUndo();
        showUndoDeclinedToast();
        return;
      }
    }

    undoHistoryActions.commitUndo();
    runHistoryRestore(() => {
      if (isCalendarVisibilityEntry(entry)) {
        replayCalendarVisibility(
          !entry.isVisible,
          entry.calendarId,
          entry.label,
        );
      } else if (isHiddenEntry(entry)) {
        setEventHidden(entry.eventId, !entry.hidden);
      } else if (isRsvpEntry(entry)) {
        mutations.rsvp({
          id: entry.id as EventId,
          responseStatus: entry.before,
          scope: "single",
          accountEmail: entry.accountEmail,
        });
      } else if (isDeleteEntry(entry)) {
        // A delete surfaced a "Deleted" toast; flip it to "Restored" only
        // once the recreate actually lands (or to a failure toast if it
        // doesn't) — the mutation can still fail the strict write schema or
        // no-op against a stale sync command, and the toast should never
        // claim success before the server has said so.
        undoDelete(entry.event, {
          onSuccess: showRestoredToast,
          onError: showRestoreFailedToast,
        });
      } else if (isCreateEntry(entry)) {
        undoCreate(entry.event);
      } else {
        replaySnapshot(entry.id as EventId, entry.before);
      }
    });
    if (targetEventId !== null && !isCreateEntry(entry)) {
      focusCalendarEventElement(targetEventId);
    }
  }, [
    queryClient,
    source,
    undoDelete,
    undoCreate,
    replaySnapshot,
    setEventHidden,
    mutations,
  ]);

  const redo = useCallback(() => {
    const entry = undoHistoryActions.peekRedo();
    if (!entry) {
      showStatusToast(UNDO_STATUS_TOAST_ID, "Nothing to redo");
      return;
    }

    if (isUnrecordedEntry(entry)) {
      undoHistoryActions.dropTopRedo();
      showStatusToast(UNDO_STATUS_TOAST_ID, "Can't undo the last change");
      return;
    }

    if (entry.kind === "edit") {
      const current = findEventInCache(queryClient, entry.id, source);
      if (current && !snapshotMatches(current, entry.before)) {
        undoHistoryActions.dropTopRedo();
        showUndoDeclinedToast();
        return;
      }
    }

    if (isRsvpEntry(entry)) {
      const current = findEventInCache(queryClient, entry.id, source);
      if (
        current &&
        selfAttendeeResponseStatus(current, entry.accountEmail) !== entry.before
      ) {
        undoHistoryActions.dropTopRedo();
        showUndoDeclinedToast();
        return;
      }
    }

    undoHistoryActions.commitRedo();
    runHistoryRestore(() => {
      if (isCalendarVisibilityEntry(entry)) {
        replayCalendarVisibility(
          entry.isVisible,
          entry.calendarId,
          entry.label,
        );
      } else if (isHiddenEntry(entry)) {
        setEventHidden(entry.eventId, entry.hidden);
      } else if (isRsvpEntry(entry)) {
        mutations.rsvp({
          id: entry.id as EventId,
          responseStatus: entry.after,
          scope: "single",
          accountEmail: entry.accountEmail,
        });
      } else if (isDeleteEntry(entry)) {
        mutations.delete({ id: entry.event.id as EventId, scope: "this" });
      } else if (isCreateEntry(entry)) {
        const { event } = entry;
        if (event.content.kind !== "details") return;
        mutations.create({
          id: event.id,
          calendarId: event.calendarId,
          content: {
            ...event.content,
            location: detailsLocation(event.content),
          },
          schedule: event.schedule,
          recurrence:
            event.recurrence.kind === "series"
              ? { kind: "series", rules: event.recurrence.rules }
              : { kind: "single" },
          restore: true,
        });
      } else {
        replaySnapshot(entry.id as EventId, entry.after);
      }
    });
    const redoEventId = entryEventId(entry);
    if (isCreateEntry(entry)) {
      focusCalendarEventElement(entry.event.id);
    } else if (redoEventId !== null && !isDeleteEntry(entry)) {
      focusCalendarEventElement(redoEventId);
    }
  }, [queryClient, source, mutations, replaySnapshot, setEventHidden]);

  return { undo, redo, canUndo, canRedo };
}
