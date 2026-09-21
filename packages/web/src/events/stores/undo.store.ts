import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { type Event } from "@core/types/event.contracts";
import { IS_DEV } from "@web/common/constants/env.constants";
import {
  getEventRepositorySourceSnapshot,
  subscribeToEventRepositorySource,
} from "@web/events/repositories/event.repository.source.store";

/**
 * One undoable action. Event writes keep full snapshots so undo/redo are
 * symmetric replays through the same mutation the user used. Non-event
 * kinds (starting with hide/show) carry only the fields their own inverse
 * needs. Each kind owns its inverse; there is no command bus.
 *
 * Event edit/delete entries are scope-"this" by construction
 * (event.mutation-history.ts only ever records at that scope). A create is
 * an unscoped whole-event write. A scope "all"/"thisAndFollowing" edit has
 * no client-computable inverse (the server rewrites/splits the series) and
 * is never recorded as an event snapshot.
 */
export type UndoHistoryEntry =
  | {
      kind: "edit";
      id: string;
      before: Event;
      after: Event;
    }
  | { kind: "delete"; event: Event }
  | { kind: "create"; event: Event }
  | { kind: "hidden"; eventId: string; hidden: boolean };

export interface State_UndoHistory {
  past: UndoHistoryEntry[];
  future: UndoHistoryEntry[];
}

export const initialUndoHistoryState: State_UndoHistory = {
  past: [],
  future: [],
};

const MAX_HISTORY = 30;

// Selectors passed to this hook must return primitives or stable references;
// a selector that builds a new object/array each call needs `useShallow`.
export const useUndoHistoryStore = create<State_UndoHistory>()(
  devtools(() => initialUndoHistoryState, {
    name: "compass/undo-history",
    enabled: IS_DEV,
  }),
);

// Guard against undo/redo replays recording themselves as new history.
// Module-level rather than store state because it's transient and only ever
// checked synchronously within the same tick as the replay `.mutate()` calls.
let restoring = false;

export const isRestoringHistory = () => restoring;

export const runHistoryRestore = (fn: () => void) => {
  restoring = true;
  try {
    fn();
  } finally {
    restoring = false;
  }
};

// The event id a coalescing candidate targets, or null for kinds that never
// coalesce (delete/create/hidden — only a run of same-event edits merges).
const coalesceTargetId = (entry: UndoHistoryEntry): string | null =>
  entry.kind === "edit" ? entry.id : null;

const entryEvent = (entry: UndoHistoryEntry): Event | null => {
  if (entry.kind === "edit") return entry.before;
  if (entry.kind === "delete" || entry.kind === "create") return entry.event;
  return null;
};

const entrySeriesId = (entry: UndoHistoryEntry): string | null => {
  const event = entryEvent(entry);
  if (!event) return null;
  if (event.recurrence.kind === "occurrence") {
    return event.recurrence.seriesId;
  }
  return event.recurrence.kind === "series" ? event.id : null;
};

export const undoHistoryActions = {
  // Consecutive edits to the SAME event within COALESCE_WINDOW_MS merge into
  // one history entry (keep the run's first `before`, take its last
  // `after`) instead of appending a new one — an arrow-key nudge held down
  // fires one mutation per keypress, and without this a handful of keypresses
  // floods history and evicts real, unrelated entries under MAX_HISTORY.
  // Coalescing is skipped once anything has been undone (future is
  // non-empty): the top of `past` is then a REDO target, and folding a fresh
  // edit into it would silently rewrite what redo replays.
  record: (entry: UndoHistoryEntry) =>
    useUndoHistoryStore.setState(
      (state) => {
        const targetId = coalesceTargetId(entry);
        const top = state.past.at(-1);
        if (
          targetId !== null &&
          state.future.length === 0 &&
          top?.kind === "edit" &&
          top.id === targetId &&
          entry.kind === "edit"
        ) {
          const merged: UndoHistoryEntry = {
            kind: "edit",
            id: entry.id,
            before: top.before,
            after: entry.after,
          };
          return { past: [...state.past.slice(0, -1), merged], future: [] };
        }
        return {
          past: [...state.past, entry].slice(-MAX_HISTORY),
          future: [],
        };
      },
      false,
      { type: "record" },
    ),

  // Read the next undo/redo target WITHOUT consuming it — the caller
  // validates (staleness, read-only, etc.) before deciding whether to
  // commitUndo/commitRedo or leave the stack untouched. Replacing the old
  // pop-first design: popping before validation meant an aborted replay
  // (blocked by a read-only guard, a stale snapshot, an unsupported content
  // kind) silently moved the entry to the other stack anyway, so the user
  // saw nothing happen AND their next Cmd+Z hit the wrong entry.
  peekUndo: (): UndoHistoryEntry | null =>
    useUndoHistoryStore.getState().past.at(-1) ?? null,

  peekRedo: (): UndoHistoryEntry | null =>
    useUndoHistoryStore.getState().future.at(-1) ?? null,

  // Move the peeked entry past -> future after a successful (or intentionally
  // abandoned — see dropTopUndo) undo replay.
  commitUndo: (): void =>
    useUndoHistoryStore.setState(
      (state) => {
        const entry = state.past.at(-1);
        if (!entry) return state;
        return {
          past: state.past.slice(0, -1),
          future: [...state.future, entry],
        };
      },
      false,
      { type: "commitUndo" },
    ),

  commitRedo: (): void =>
    useUndoHistoryStore.setState(
      (state) => {
        const entry = state.future.at(-1);
        if (!entry) return state;
        return {
          // Redo re-applying an entry can push `past` past MAX_HISTORY (undo
          // never trims `future`, so a long undo run followed by a full redo
          // run must not silently grow `past` unbounded either).
          past: [...state.past, entry].slice(-MAX_HISTORY),
          future: state.future.slice(0, -1),
        };
      },
      false,
      { type: "commitRedo" },
    ),

  // Discard the top undo/redo entry without replaying or committing it —
  // used when a staleness check finds the entry no longer safe to apply
  // (something else changed the event since it was recorded). The entry is
  // gone, not moved to the other stack: replaying it later would be exactly
  // as unsafe.
  dropTopUndo: (): void =>
    useUndoHistoryStore.setState(
      (state) => ({ past: state.past.slice(0, -1) }),
      false,
      { type: "dropTopUndo" },
    ),

  dropTopRedo: (): void =>
    useUndoHistoryStore.setState(
      (state) => ({ future: state.future.slice(0, -1) }),
      false,
      { type: "dropTopRedo" },
    ),

  // A scope-all/following operation rewrites this series, invalidating only
  // its narrow snapshots. Keep independent event history intact.
  discardSeries: (seriesId: string): void =>
    useUndoHistoryStore.setState(
      (state) => ({
        past: state.past.filter((entry) => entrySeriesId(entry) !== seriesId),
        future: state.future.filter(
          (entry) => entrySeriesId(entry) !== seriesId,
        ),
      }),
      false,
      { type: "discardSeries" },
    ),

  clear: (): void =>
    useUndoHistoryStore.setState(initialUndoHistoryState, false, {
      type: "clear",
    }),
};

// Clear history on a local<->remote repository flip or logout — both are a
// change in the resolved event repository source. An entry recorded against
// one repository replayed against the other would create/replace/delete an
// id the new repository has never heard of (the local IndexedDB store and
// the remote sync service mint/track ids independently).
let lastSource = getEventRepositorySourceSnapshot();
subscribeToEventRepositorySource(() => {
  const next = getEventRepositorySourceSnapshot();
  if (next === lastSource) return;
  lastSource = next;
  undoHistoryActions.clear();
});

export const selectCanUndo = (state: State_UndoHistory) =>
  state.past.length > 0;

export const selectCanRedo = (state: State_UndoHistory) =>
  state.future.length > 0;
