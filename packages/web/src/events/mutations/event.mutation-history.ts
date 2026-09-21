import { type QueryClient } from "@tanstack/react-query";
import { type Event } from "@core/types/event.contracts";
import {
  type RsvpResponseStatus,
  RsvpResponseStatusSchema,
} from "@core/types/event-attendance.contracts";
import {
  type RecurrenceScope,
  type RsvpEventInput,
} from "@core/types/event-command.contracts";
import { findEventInCache } from "@web/events/queries/event.query.cache";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import {
  isRestoringHistory,
  type UndoHistoryEntry,
} from "@web/events/stores/undo.store";

// A "series" row (the master/base) can't be undone from a client snapshot:
// it's only ever written at scope "all"/"thisAndFollowing" (never "this",
// gated below), and the server rewrites/splits the series rather than
// applying a client-computable inverse. A "single" event or one recurring
// "occurrence" (always scope "this") both DO have a real inverse — replace
// back to the snapshot, or un-cancel/recreate under the original id — so
// both are undoable.
export const isUndoableRecurrence = (event: Event): boolean =>
  event.recurrence.kind !== "series";

const isThisScope = (scope?: RecurrenceScope) => !scope || scope === "this";

function pendingEditBefore(
  queryClient: QueryClient,
  id: string,
): Event | undefined {
  const pending = queryClient
    .getMutationCache()
    .getAll()
    .filter((mutation) => mutation.state.status === "pending")
    .sort((a, b) => a.mutationId - b.mutationId);

  for (const mutation of pending) {
    const entry = (mutation.state.variables as { undoEntry?: UndoHistoryEntry })
      ?.undoEntry;
    if (entry?.kind === "edit" && entry.id === id) return entry.before;
  }
  return undefined;
}

export function snapshotEventEditHistory({
  id,
  after,
  scope,
  queryClient,
  source,
}: {
  id: string;
  after: Event;
  scope: RecurrenceScope;
  queryClient: QueryClient;
  source: EventRepositorySource;
}): UndoHistoryEntry | null {
  if (isRestoringHistory() || !isThisScope(scope)) return null;

  const before =
    pendingEditBefore(queryClient, id) ??
    findEventInCache(queryClient, id, source);
  if (
    !before ||
    !isUndoableRecurrence(before) ||
    !isUndoableRecurrence(after)
  ) {
    return null;
  }

  return { kind: "edit", id, before, after };
}

export function snapshotEventCreateHistory({
  event,
}: {
  event: Event;
}): UndoHistoryEntry | null {
  // Unlike edit/delete, isUndoableRecurrence does not gate this: a create's
  // EditableRecurrence is only ever "single" or "series" (never
  // "occurrence"/"exception" — a create can't target a bare instance), and
  // BOTH are undoable — a single event's undo deletes it, a brand-new
  // series' undo deletes the whole series (scope "all", see
  // useUndoRedo.undoCreate).
  if (isRestoringHistory()) return null;
  return { kind: "create", event };
}

export function snapshotEventDeleteHistory({
  id,
  scope,
  queryClient,
  source,
}: {
  id: string;
  scope: RecurrenceScope;
  queryClient: QueryClient;
  source: EventRepositorySource;
}): {
  existing: Event | null;
  entry: UndoHistoryEntry | null;
  deletedToast: boolean | undefined;
} {
  const existing = findEventInCache(queryClient, id, source);
  if (isRestoringHistory()) {
    return { existing, entry: null, deletedToast: undefined };
  }

  const undoable =
    !!existing && isUndoableRecurrence(existing) && isThisScope(scope);
  return {
    existing,
    entry: undoable ? { kind: "delete", event: existing } : null,
    deletedToast: undoable,
  };
}

export function selfAttendeeResponseStatus(event: Event, accountEmail: string) {
  if (event.content.kind !== "details") return undefined;
  return event.content.attendees?.find(
    (attendee) => attendee.email.toLowerCase() === accountEmail.toLowerCase(),
  )?.responseStatus;
}

export function snapshotRsvpHistory({
  id,
  original,
  responseStatus,
  scope,
  accountEmail,
}: {
  id: string;
  original: Event;
  responseStatus: RsvpResponseStatus;
  scope: RsvpEventInput["scope"];
  accountEmail: string;
}): UndoHistoryEntry | null {
  if (isRestoringHistory() || scope !== "single") return null;
  const before = RsvpResponseStatusSchema.safeParse(
    selfAttendeeResponseStatus(original, accountEmail),
  );
  if (!before.success) return null;
  return {
    kind: "rsvp",
    id,
    accountEmail,
    before: before.data,
    after: responseStatus,
  };
}
