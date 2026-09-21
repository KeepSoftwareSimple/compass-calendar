import { type EventId } from "@core/types/domain-primitives";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  isRestoringHistory,
  runHistoryRestore,
  type UndoHistoryEntry,
  undoHistoryActions,
  useUndoHistoryStore,
} from "./undo.store";
import { describe, expect, it } from "bun:test";

const event = (id: string) =>
  createMockEvent({
    id: id as EventId,
    content: { kind: "details", title: id, description: "" },
  });

const occurrence = (id: string, seriesId: string) =>
  createMockEvent({
    id: id as EventId,
    recurrence: { kind: "occurrence", seriesId: seriesId as EventId },
  });

const editEntry = (id: string, title = `${id}-moved`): UndoHistoryEntry => ({
  kind: "edit",
  id,
  before: event(id),
  after: {
    ...event(id),
    content: { kind: "details", title, description: "" },
  },
});

describe("undoHistoryActions", () => {
  it("records entries and clears the redo stack", () => {
    undoHistoryActions.record(editEntry("a"));
    undoHistoryActions.commitUndo();
    expect(useUndoHistoryStore.getState().future).toHaveLength(1);

    undoHistoryActions.record(editEntry("b"));

    const { past, future } = useUndoHistoryStore.getState();
    expect(past.map((e) => (e.kind === "edit" ? e.id : null))).toEqual(["b"]);
    expect(future).toHaveLength(0);
  });

  it("caps history at 30 entries, dropping the oldest", () => {
    for (let i = 0; i < 35; i++) {
      // Distinct ids so consecutive entries never coalesce.
      undoHistoryActions.record(editEntry(`e${i}`));
    }

    const { past } = useUndoHistoryStore.getState();
    expect(past).toHaveLength(30);
    expect(past[0]).toMatchObject({ id: "e5" });
    expect(past.at(-1)).toMatchObject({ id: "e34" });
  });

  it("coalesces consecutive edits to the same event into one entry", () => {
    undoHistoryActions.record(editEntry("a", "first"));
    undoHistoryActions.record(editEntry("a", "second"));
    undoHistoryActions.record(editEntry("a", "third"));

    const { past } = useUndoHistoryStore.getState();
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({
      kind: "edit",
      id: "a",
      after: { content: { title: "third" } },
    });
    // The run's FIRST before survives the merge, not an intermediate one.
    expect(past[0]).toMatchObject({ before: event("a") });
  });

  it("does not coalesce edits to different events", () => {
    undoHistoryActions.record(editEntry("a"));
    undoHistoryActions.record(editEntry("b"));

    expect(useUndoHistoryStore.getState().past).toHaveLength(2);
  });

  it("does not coalesce once something has been undone (top of past is a redo target)", () => {
    undoHistoryActions.record(editEntry("a", "first"));
    undoHistoryActions.record(editEntry("b"));
    undoHistoryActions.commitUndo(); // undoes "b"
    undoHistoryActions.record(editEntry("a", "second"));

    const { past } = useUndoHistoryStore.getState();
    expect(past).toHaveLength(2);
    expect(past[1]).toMatchObject({ after: { content: { title: "second" } } });
  });

  it("moves entries between stacks on commitUndo/commitRedo", () => {
    undoHistoryActions.record(editEntry("a"));
    undoHistoryActions.record({ kind: "delete", event: event("b") });

    const peeked = undoHistoryActions.peekUndo();
    expect(peeked).toMatchObject({ kind: "delete" });
    undoHistoryActions.commitUndo();
    expect(useUndoHistoryStore.getState().past).toHaveLength(1);
    expect(useUndoHistoryStore.getState().future).toHaveLength(1);

    const redone = undoHistoryActions.peekRedo();
    expect(redone).toBe(peeked);
    undoHistoryActions.commitRedo();
    expect(useUndoHistoryStore.getState().past).toHaveLength(2);
    expect(useUndoHistoryStore.getState().future).toHaveLength(0);
  });

  it("returns null when peeking empty stacks, and commit/drop are no-ops", () => {
    expect(undoHistoryActions.peekUndo()).toBeNull();
    expect(undoHistoryActions.peekRedo()).toBeNull();
    undoHistoryActions.commitUndo();
    undoHistoryActions.commitRedo();
    undoHistoryActions.dropTopUndo();
    undoHistoryActions.dropTopRedo();
    expect(useUndoHistoryStore.getState()).toEqual({ past: [], future: [] });
  });

  it("peekUndo/peekRedo do not consume the entry", () => {
    undoHistoryActions.record(editEntry("a"));

    undoHistoryActions.peekUndo();
    undoHistoryActions.peekUndo();

    expect(useUndoHistoryStore.getState().past).toHaveLength(1);
  });

  // The regression lock for the pop-before-validate bug: an aborted replay
  // (blocked by a read-only guard, a stale snapshot, an unsupported content
  // kind) must leave the entry exactly where it was, not silently move it to
  // the other stack — the caller peeks, decides not to proceed, and simply
  // never calls commitUndo/commitRedo.
  it("leaves the stack untouched when the caller peeks but never commits", () => {
    undoHistoryActions.record(editEntry("a"));

    undoHistoryActions.peekUndo();

    const { past, future } = useUndoHistoryStore.getState();
    expect(past).toHaveLength(1);
    expect(future).toHaveLength(0);
  });

  it("dropTopUndo discards the entry instead of moving it to redo", () => {
    undoHistoryActions.record(editEntry("a"));

    undoHistoryActions.dropTopUndo();

    expect(useUndoHistoryStore.getState()).toEqual({ past: [], future: [] });
  });

  it("dropTopRedo discards the entry instead of moving it back to undo", () => {
    undoHistoryActions.record(editEntry("a"));
    undoHistoryActions.commitUndo();

    undoHistoryActions.dropTopRedo();

    expect(useUndoHistoryStore.getState()).toEqual({ past: [], future: [] });
  });

  it("clear empties both stacks", () => {
    undoHistoryActions.record(editEntry("a"));
    undoHistoryActions.record(editEntry("b"));
    undoHistoryActions.commitUndo();

    undoHistoryActions.clear();

    expect(useUndoHistoryStore.getState()).toEqual({ past: [], future: [] });
  });

  it("discards only history for a promoted series", () => {
    const seriesId = "series";
    const seriesOccurrence = occurrence("occurrence", seriesId);
    undoHistoryActions.record({ kind: "delete", event: seriesOccurrence });
    undoHistoryActions.record(editEntry("unrelated"));
    undoHistoryActions.record({
      kind: "hidden",
      eventId: "occurrence",
      hidden: true,
    });

    undoHistoryActions.discardSeries(seriesId);

    expect(useUndoHistoryStore.getState().past).toEqual([
      editEntry("unrelated"),
      { kind: "hidden", eventId: "occurrence", hidden: true },
    ]);
  });

  it("does not coalesce hide/show entries, even for the same event", () => {
    undoHistoryActions.record({
      kind: "hidden",
      eventId: "a",
      hidden: true,
    });
    undoHistoryActions.record({
      kind: "hidden",
      eventId: "a",
      hidden: false,
    });

    expect(useUndoHistoryStore.getState().past).toEqual([
      { kind: "hidden", eventId: "a", hidden: true },
      { kind: "hidden", eventId: "a", hidden: false },
    ]);
  });

  it("does not coalesce calendar visibility entries", () => {
    const calendarId = "cal-a" as never;
    undoHistoryActions.record({
      kind: "calendarVisibility",
      calendarId,
      label: "Work",
      isVisible: false,
    });
    undoHistoryActions.record({
      kind: "calendarVisibility",
      calendarId,
      label: "Work",
      isVisible: true,
    });

    expect(useUndoHistoryStore.getState().past).toHaveLength(2);
  });

  it("collapses consecutive unrecorded markers into one and still clears redo", () => {
    undoHistoryActions.record(editEntry("a"));
    undoHistoryActions.commitUndo();
    undoHistoryActions.record({ kind: "unrecorded" });
    undoHistoryActions.record({ kind: "unrecorded" });
    undoHistoryActions.record({ kind: "unrecorded" });

    const { past, future } = useUndoHistoryStore.getState();
    expect(past).toEqual([{ kind: "unrecorded" }]);
    expect(future).toHaveLength(0);
  });

  it("commitRedo caps past at 30, dropping the oldest on a long redo run", () => {
    for (let i = 0; i < 30; i++) {
      undoHistoryActions.record(editEntry(`e${i}`));
    }
    // Undo all 30 (past -> future) without recording anything new in
    // between — a fresh record() clears future, so this loop must run to
    // completion before any redo.
    for (let i = 0; i < 30; i++) {
      undoHistoryActions.commitUndo();
    }
    expect(useUndoHistoryStore.getState().future).toHaveLength(30);

    for (let i = 0; i < 30; i++) {
      undoHistoryActions.commitRedo();
    }

    expect(useUndoHistoryStore.getState().past).toHaveLength(30);
    expect(useUndoHistoryStore.getState().future).toHaveLength(0);
  });
});

describe("runHistoryRestore", () => {
  it("sets the restoring flag only for the duration of the callback", () => {
    expect(isRestoringHistory()).toBe(false);

    runHistoryRestore(() => {
      expect(isRestoringHistory()).toBe(true);
    });

    expect(isRestoringHistory()).toBe(false);
  });

  it("resets the flag when the callback throws", () => {
    expect(() =>
      runHistoryRestore(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(isRestoringHistory()).toBe(false);
  });
});
