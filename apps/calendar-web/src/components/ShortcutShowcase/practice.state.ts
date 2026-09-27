import { type EventColorSlot } from "@core/types/event-color.contracts";

/**
 * Ephemeral state for the Shortcut Showcase's practice calendar. Nothing here
 * touches storage, queries, or the real grid stores: the blocks exist only
 * while the takeover is mounted, so every transition can be a plain pure
 * function with no side effects.
 */

export type PracticeEventBlock = {
  id: string;
  title: string;
  /** 0-2, left to right. */
  dayIndex: number;
  /** Minutes from midnight. */
  startMin: number;
  endMin: number;
  color?: EventColorSlot;
};

export type PracticeNudgeDirection = "up" | "down" | "left" | "right";

/** Start or end of the focused block; `null` means the whole event. */
export type PracticeEdge = "start" | "end" | null;

export type PracticeState = {
  events: PracticeEventBlock[];
  focusedId: string | null;
  /**
   * A spawned-but-unlocked piece. While set, plain arrows move it (the real
   * grid moves an open draft the same way); Enter locks it via lockPlacing.
   */
  placingId: string | null;
  /** Tab-cycled edge on the focused event; `null` is the whole block. */
  edge: PracticeEdge;
  /** Last deleted block, so undo can restore it. */
  lastDeleted: PracticeEventBlock | null;
};

export const SHOWCASE_GRID_START_HOUR = 8;
export const SHOWCASE_GRID_END_HOUR = 18;
export const SHOWCASE_DAY_COUNT = 3;
export const PRACTICE_NUDGE_MIN = 15;

export const PRACTICE_GRID_START_MIN = SHOWCASE_GRID_START_HOUR * 60;
export const PRACTICE_GRID_END_MIN = SHOWCASE_GRID_END_HOUR * 60;

export const createPracticeState = (
  events: PracticeEventBlock[],
): PracticeState => ({
  events,
  focusedId: null,
  placingId: null,
  edge: null,
  lastDeleted: null,
});

/** Drop a piece on the board, focused and unlocked. Same-id spawns replace. */
export const spawnPiece = (
  state: PracticeState,
  piece: PracticeEventBlock,
): PracticeState => ({
  ...state,
  events: [...state.events.filter((event) => event.id !== piece.id), piece],
  focusedId: piece.id,
  placingId: piece.id,
  edge: null,
});

/** Enter on a placing piece: it stays focused but stops following arrows. */
export const lockPlacing = (state: PracticeState): PracticeState =>
  state.placingId ? { ...state, placingId: null } : state;

export const focusEvent = (state: PracticeState, id: string): PracticeState => {
  if (!state.events.some((event) => event.id === id)) return state;
  return { ...state, focusedId: id, placingId: null, edge: null };
};

export const ensureFocused = (state: PracticeState): PracticeState => {
  if (
    state.focusedId &&
    state.events.some((event) => event.id === state.focusedId)
  ) {
    return state;
  }
  const fallback = state.events[0];
  if (!fallback) return state;
  return { ...state, focusedId: fallback.id, edge: null };
};

const nudgeFocusedEdge = (
  event: PracticeEventBlock,
  edge: Exclude<PracticeEdge, null>,
  direction: PracticeNudgeDirection,
): PracticeEventBlock | null => {
  // Timed edges only move in time, matching the real grid (left/right is a
  // day shift and would push the block off this 3-day sandbox).
  if (direction === "left" || direction === "right") return null;
  const delta = direction === "down" ? PRACTICE_NUDGE_MIN : -PRACTICE_NUDGE_MIN;
  if (edge === "start") {
    const startMin = Math.max(
      PRACTICE_GRID_START_MIN,
      Math.min(event.endMin - PRACTICE_NUDGE_MIN, event.startMin + delta),
    );
    if (startMin === event.startMin) return null;
    return { ...event, startMin };
  }
  const endMin = Math.min(
    PRACTICE_GRID_END_MIN,
    Math.max(event.startMin + PRACTICE_NUDGE_MIN, event.endMin + delta),
  );
  if (endMin === event.endMin) return null;
  return { ...event, endMin };
};

export const nudgeFocused = (
  state: PracticeState,
  direction: PracticeNudgeDirection,
): PracticeState => {
  const focused = ensureFocused(state);
  if (!focused.focusedId) return state;

  let moved = false;
  const events = focused.events.map((event) => {
    if (event.id !== focused.focusedId) return event;
    if (focused.edge) {
      const next = nudgeFocusedEdge(event, focused.edge, direction);
      if (!next) return event;
      moved = true;
      return next;
    }
    if (direction === "left" || direction === "right") {
      const dayIndex = Math.max(
        0,
        Math.min(
          SHOWCASE_DAY_COUNT - 1,
          event.dayIndex + (direction === "right" ? 1 : -1),
        ),
      );
      if (dayIndex === event.dayIndex) return event;
      moved = true;
      return { ...event, dayIndex };
    }
    const duration = event.endMin - event.startMin;
    const delta =
      direction === "down" ? PRACTICE_NUDGE_MIN : -PRACTICE_NUDGE_MIN;
    const startMin = Math.max(
      PRACTICE_GRID_START_MIN,
      Math.min(PRACTICE_GRID_END_MIN - duration, event.startMin + delta),
    );
    if (startMin === event.startMin) return event;
    moved = true;
    return { ...event, startMin, endMin: startMin + duration };
  });

  if (!moved) return focused === state ? state : focused;
  return { ...focused, events };
};

const EDGE_CYCLE: PracticeEdge[] = [null, "start", "end"];

export const cycleEdgeFocus = (
  state: PracticeState,
  direction: "forward" | "backward",
): PracticeState => {
  const focused = ensureFocused(state);
  if (!focused.focusedId) return state;
  const index = EDGE_CYCLE.indexOf(focused.edge);
  const step = direction === "forward" ? 1 : -1;
  const nextEdge =
    EDGE_CYCLE[(index + step + EDGE_CYCLE.length) % EDGE_CYCLE.length] ?? null;
  return { ...focused, edge: nextEdge };
};

export const deleteFocused = (state: PracticeState): PracticeState => {
  const focused = ensureFocused(state);
  if (!focused.focusedId) return state;
  const deleted = focused.events.find(
    (event) => event.id === focused.focusedId,
  );
  if (!deleted) return state;
  const events = focused.events.filter(
    (event) => event.id !== focused.focusedId,
  );
  return {
    ...focused,
    events,
    focusedId: events[0]?.id ?? null,
    placingId: null,
    lastDeleted: deleted,
    edge: null,
  };
};

export const undoDelete = (state: PracticeState): PracticeState => {
  if (!state.lastDeleted) return state;
  const restored = state.lastDeleted;
  return {
    ...state,
    events: [...state.events, restored],
    focusedId: restored.id,
    lastDeleted: null,
    edge: null,
  };
};
