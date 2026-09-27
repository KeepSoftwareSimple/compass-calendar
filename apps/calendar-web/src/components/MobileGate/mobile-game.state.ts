import {
  MOBILE_LEVELS,
  type MobileBlock,
  type MobileLevel,
  type MobilePiece,
  type MobileSlot,
} from "@web/components/MobileGate/mobile-game.levels";
import { scorePlacement } from "@web/components/ShortcutShowcase/game.tasks";

/**
 * The Time Block Party reducer. Every function is pure and every timestamp
 * arrives as an argument (no Date.now() in here), so a full run scripts
 * cleanly in tests without fake timers. Scoring constants are shared with
 * Block Party so the two games stay in sync.
 */

export type MobileGamePhase = "intro" | "playing" | "levelClear" | "ended";

export type MobileGameState = {
  phase: MobileGamePhase;
  levelIndex: number;
  /** Index into the current level's pieces. */
  pieceIndex: number;
  /** Seeds plus locked pieces for the current level. */
  board: MobileBlock[];
  score: number;
  /** Consecutive speed-bonus placements; resets on a slow drop or miss. */
  streak: number;
  misses: number;
  /** True when the player skipped from the intro straight to the handoff. */
  skipped: boolean;
  pieceStartedAtMs: number;
  /** Seq bumps on every award so the UI can key the score popup. */
  lastAward: { seq: number; points: number; pieceId: string } | null;
  /** Seq bumps on every miss so the UI can key the shake. */
  lastMiss: { seq: number; pieceId: string } | null;
  /** Snapped slot under the finger while dragging. */
  hoverSlot: MobileSlot | null;
};

export const createInitialMobileGameState = (): MobileGameState => ({
  phase: "intro",
  levelIndex: 0,
  pieceIndex: 0,
  board: [],
  score: 0,
  streak: 0,
  misses: 0,
  skipped: false,
  pieceStartedAtMs: 0,
  lastAward: null,
  lastMiss: null,
  hoverSlot: null,
});

export const currentLevel = (state: MobileGameState): MobileLevel =>
  MOBILE_LEVELS[
    Math.min(state.levelIndex, MOBILE_LEVELS.length - 1)
  ] as MobileLevel;

export const currentPiece = (state: MobileGameState): MobilePiece | null =>
  state.phase === "playing"
    ? (currentLevel(state).pieces[state.pieceIndex] ?? null)
    : null;

const levelBoard = (level: MobileLevel): MobileBlock[] =>
  level.seedBlocks.map((block) => ({ ...block }));

export const startGame = (
  state: MobileGameState,
  nowMs: number,
): MobileGameState => {
  if (state.phase !== "intro") return state;
  return {
    ...state,
    phase: "playing",
    board: levelBoard(currentLevel(state)),
    pieceStartedAtMs: nowMs,
  };
};

export const skipToEnd = (state: MobileGameState): MobileGameState => {
  if (state.phase !== "intro") return state;
  return { ...state, phase: "ended", skipped: true };
};

const sameSlot = (a: MobileSlot | null, b: MobileSlot | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.dayIndex === b.dayIndex &&
    a.startMin === b.startMin);

export const setHoverSlot = (
  state: MobileGameState,
  slot: MobileSlot | null,
): MobileGameState => {
  if (state.phase !== "playing") return state;
  if (sameSlot(state.hoverSlot, slot)) return state;
  return { ...state, hoverSlot: slot };
};

/**
 * Release the dragged piece. On the target slot it locks and scores
 * (base + speed bonus, times the streak multiplier); anywhere else on the
 * board is a miss worth nothing that resets the streak. A release with no
 * hover slot (dragged back to the tray) just cancels.
 */
export const dropPiece = (
  state: MobileGameState,
  nowMs: number,
): MobileGameState => {
  if (state.phase !== "playing") return state;
  const piece = currentPiece(state);
  const slot = state.hoverSlot;
  if (!piece || !slot) return { ...state, hoverSlot: null };

  const onTarget =
    slot.dayIndex === piece.target.dayIndex &&
    slot.startMin === piece.target.startMin;
  if (!onTarget) {
    return {
      ...state,
      hoverSlot: null,
      misses: state.misses + 1,
      streak: 0,
      lastMiss: { seq: (state.lastMiss?.seq ?? 0) + 1, pieceId: piece.id },
    };
  }

  const { streak, points } = scorePlacement(
    state.streak,
    nowMs - state.pieceStartedAtMs,
  );

  const level = currentLevel(state);
  const placed: MobileGameState = {
    ...state,
    hoverSlot: null,
    board: [
      ...state.board,
      {
        id: piece.id,
        title: piece.title,
        dayIndex: slot.dayIndex,
        startMin: slot.startMin,
        endMin: slot.startMin + piece.durationMin,
        color: piece.color,
      },
    ],
    score: state.score + points,
    streak,
    pieceIndex: state.pieceIndex + 1,
    pieceStartedAtMs: nowMs,
    lastAward: {
      seq: (state.lastAward?.seq ?? 0) + 1,
      points,
      pieceId: piece.id,
    },
  };

  if (placed.pieceIndex < level.pieces.length) return placed;
  return {
    ...placed,
    phase: state.levelIndex + 1 < MOBILE_LEVELS.length ? "levelClear" : "ended",
  };
};

export const advanceLevel = (
  state: MobileGameState,
  nowMs: number,
): MobileGameState => {
  if (state.phase !== "levelClear") return state;
  const next = {
    ...state,
    phase: "playing" as const,
    levelIndex: state.levelIndex + 1,
    pieceIndex: 0,
    pieceStartedAtMs: nowMs,
  };
  return { ...next, board: levelBoard(currentLevel(next)) };
};
