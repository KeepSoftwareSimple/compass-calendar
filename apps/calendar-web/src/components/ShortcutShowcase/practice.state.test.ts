import {
  createPracticeState,
  cycleEdgeFocus,
  deleteFocused,
  ensureFocused,
  focusEvent,
  lockPlacing,
  nudgeFocused,
  PRACTICE_GRID_END_MIN,
  PRACTICE_GRID_START_MIN,
  PRACTICE_NUDGE_MIN,
  type PracticeEventBlock,
  spawnPiece,
  undoDelete,
} from "@web/components/ShortcutShowcase/practice.state";
import { describe, expect, it } from "bun:test";

const block = (
  overrides: Partial<PracticeEventBlock> = {},
): PracticeEventBlock => ({
  id: "block-a",
  title: "Block A",
  dayIndex: 1,
  startMin: 10 * 60,
  endMin: 11 * 60,
  ...overrides,
});

const baseState = () =>
  createPracticeState([
    block(),
    block({
      id: "block-b",
      title: "Block B",
      dayIndex: 2,
      startMin: 12 * 60,
      endMin: 13 * 60,
    }),
  ]);

describe("spawning and locking pieces", () => {
  it("spawns a focused, unlocked piece", () => {
    const spawned = spawnPiece(baseState(), block({ id: "piece" }));
    expect(spawned.focusedId).toBe("piece");
    expect(spawned.placingId).toBe("piece");
    expect(spawned.events).toHaveLength(3);
  });

  it("replaces a same-id block instead of stacking a duplicate", () => {
    const once = spawnPiece(
      baseState(),
      block({ id: "piece", startMin: 9 * 60 }),
    );
    const twice = spawnPiece(once, block({ id: "piece", startMin: 14 * 60 }));
    expect(twice.events.filter((e) => e.id === "piece")).toHaveLength(1);
    expect(twice.events.find((e) => e.id === "piece")?.startMin).toBe(14 * 60);
  });

  it("locks the placing piece but keeps it focused", () => {
    const spawned = spawnPiece(baseState(), block({ id: "piece" }));
    const locked = lockPlacing(spawned);
    expect(locked.placingId).toBeNull();
    expect(locked.focusedId).toBe("piece");
  });

  it("moves a placing piece with plain nudges and clamps at grid edges", () => {
    let state = spawnPiece(
      baseState(),
      block({
        id: "piece",
        startMin: PRACTICE_GRID_START_MIN,
        endMin: PRACTICE_GRID_START_MIN + 60,
      }),
    );
    expect(nudgeFocused(state, "up")).toBe(state);

    state = nudgeFocused(state, "down");
    expect(state.events.find((e) => e.id === "piece")?.startMin).toBe(
      PRACTICE_GRID_START_MIN + PRACTICE_NUDGE_MIN,
    );

    state = nudgeFocused(state, "left");
    expect(state.events.find((e) => e.id === "piece")?.dayIndex).toBe(0);
    expect(nudgeFocused(state, "left")).toBe(state);
  });
});

describe("focus and edges", () => {
  it("pins focus to a known event and ignores unknown ids", () => {
    const focused = focusEvent(baseState(), "block-b");
    expect(focused.focusedId).toBe("block-b");
    expect(focusEvent(baseState(), "missing")).toEqual(baseState());
  });

  it("falls back to the first event when focus is stale", () => {
    const stale = { ...baseState(), focusedId: "gone" };
    expect(ensureFocused(stale).focusedId).toBe("block-a");
  });

  it("cycles whole -> start -> end -> whole with Tab", () => {
    let state = focusEvent(baseState(), "block-a");
    state = cycleEdgeFocus(state, "forward");
    expect(state.edge).toBe("start");
    state = cycleEdgeFocus(state, "forward");
    expect(state.edge).toBe("end");
    state = cycleEdgeFocus(state, "forward");
    expect(state.edge).toBeNull();
  });

  it("moves only the focused edge and never below minimum duration", () => {
    let state = focusEvent(baseState(), "block-a");
    state = cycleEdgeFocus(state, "forward");
    state = cycleEdgeFocus(state, "forward"); // end edge

    const grown = nudgeFocused(state, "down");
    const grownBlock = grown.events.find((e) => e.id === "block-a");
    expect(grownBlock?.endMin).toBe(11 * 60 + PRACTICE_NUDGE_MIN);
    expect(grownBlock?.startMin).toBe(10 * 60);

    expect(nudgeFocused(state, "left")).toBe(state);
  });

  it("clamps end-edge growth at the bottom of the grid", () => {
    let state = createPracticeState([
      block({
        startMin: PRACTICE_GRID_END_MIN - 30,
        endMin: PRACTICE_GRID_END_MIN,
      }),
    ]);
    state = focusEvent(state, "block-a");
    state = cycleEdgeFocus(state, "forward");
    state = cycleEdgeFocus(state, "forward");
    expect(nudgeFocused(state, "down")).toBe(state);
  });
});

describe("delete and undo", () => {
  it("deletes the focused event and remembers it for undo", () => {
    const deleted = deleteFocused(focusEvent(baseState(), "block-b"));
    expect(deleted.events.some((e) => e.id === "block-b")).toBe(false);
    expect(deleted.lastDeleted?.id).toBe("block-b");
    expect(deleted.focusedId).toBe("block-a");
  });

  it("restores the deleted event and refocuses it", () => {
    const deleted = deleteFocused(focusEvent(baseState(), "block-b"));
    const restored = undoDelete(deleted);
    expect(restored.events.some((e) => e.id === "block-b")).toBe(true);
    expect(restored.focusedId).toBe("block-b");
    expect(restored.lastDeleted).toBeNull();
    expect(undoDelete(restored)).toBe(restored);
  });
});
