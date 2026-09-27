import {
  MOBILE_LEVELS,
  slotFromPointer,
} from "@web/components/MobileGate/mobile-game.levels";
import {
  advanceLevel,
  createInitialMobileGameState,
  currentLevel,
  currentPiece,
  dropPiece,
  type MobileGameState,
  setHoverSlot,
  skipToEnd,
  startGame,
} from "@web/components/MobileGate/mobile-game.state";
import {
  SPEED_BONUS_MS,
  scorePlacement,
  TASK_BASE_POINTS,
} from "@web/components/ShortcutShowcase/game.tasks";
import { describe, expect, it } from "bun:test";

/** Hover the current piece's target and drop it at `nowMs`. */
const placeCurrent = (state: MobileGameState, nowMs: number) => {
  const piece = currentPiece(state);
  if (!piece) throw new Error("no piece to place");
  return dropPiece(setHoverSlot(state, piece.target), nowMs);
};

describe("mobile game reducer", () => {
  it("scores a full three-level run with speed bonuses and streaks", () => {
    let state = startGame(createInitialMobileGameState(), 1_000);
    expect(state.phase).toBe("playing");
    expect(state.board).toEqual([]);

    let now = 1_000;
    let expectedScore = 0;
    // Every drop lands 2s after the previous one: all speedy, so the streak
    // climbs 1,2,3,... and the multiplier steps x2 at 3 and x3 at 6.
    const expectedPoints = (streak: number) =>
      scorePlacement(streak - 1, 0).points;

    let placements = 0;
    for (let level = 0; level < MOBILE_LEVELS.length; level += 1) {
      const pieceCount = (
        MOBILE_LEVELS[level] as { pieces: readonly unknown[] }
      ).pieces.length;
      for (let i = 0; i < pieceCount; i += 1) {
        now += 2_000;
        state = placeCurrent(state, now);
        placements += 1;
        expectedScore += expectedPoints(placements);
        expect(state.score).toBe(expectedScore);
        expect(state.streak).toBe(placements);
        expect(state.lastAward?.seq).toBe(placements);
        expect(state.lastAward?.points).toBe(expectedPoints(placements));
      }
      const isLast = level === MOBILE_LEVELS.length - 1;
      expect(state.phase).toBe(isLast ? "ended" : "levelClear");
      if (!isLast) {
        state = advanceLevel(state, now);
        expect(state.phase).toBe("playing");
        expect(state.levelIndex).toBe(level + 1);
        expect(state.pieceIndex).toBe(0);
        // The board resets to the new level's seeds.
        expect(state.board).toEqual(
          currentLevel(state).seedBlocks.map((block) => ({ ...block })),
        );
      }
    }

    expect(state.misses).toBe(0);
    expect(state.skipped).toBe(false);
  });

  it("pays base points without bonus on a slow drop and resets the streak", () => {
    let state = startGame(createInitialMobileGameState(), 0);
    state = placeCurrent(state, 2_000); // speedy: streak 1
    expect(state.streak).toBe(1);

    state = placeCurrent(state, 2_000 + SPEED_BONUS_MS + 1);
    expect(state.lastAward?.points).toBe(TASK_BASE_POINTS);
    expect(state.streak).toBe(0);
  });

  it("counts a wrong-slot drop as a miss that keeps the piece and resets the streak", () => {
    let state = startGame(createInitialMobileGameState(), 0);
    state = placeCurrent(state, 1_000);
    const scoreAfterFirst = state.score;

    const wrongSlot = { dayIndex: 0, startMin: 14 * 60 };
    state = dropPiece(setHoverSlot(state, wrongSlot), 2_000);

    expect(state.misses).toBe(1);
    expect(state.streak).toBe(0);
    expect(state.score).toBe(scoreAfterFirst);
    expect(state.pieceIndex).toBe(1); // still on the second piece
    expect(state.board).toHaveLength(1); // nothing new landed
    expect(state.lastMiss).toEqual({
      seq: 1,
      pieceId: currentPiece(state)?.id as string,
    });
    expect(state.hoverSlot).toBeNull();

    // The piece is still placeable afterward.
    state = placeCurrent(state, 3_000);
    expect(state.pieceIndex).toBe(2);
  });

  it("treats a drop on a level-3 busy block as a miss", () => {
    let state = startGame(createInitialMobileGameState(), 0);
    let now = 0;
    // Clear levels 1 and 2.
    while (state.levelIndex < 2) {
      now += 1_000;
      state = placeCurrent(state, now);
      if (state.phase === "levelClear") state = advanceLevel(state, now);
    }
    const decoy = currentLevel(state).seedBlocks[0];
    expect(decoy?.decoy).toBe(true);

    state = dropPiece(
      setHoverSlot(state, {
        dayIndex: (decoy as { dayIndex: number }).dayIndex,
        startMin: (decoy as { startMin: number }).startMin,
      }),
      now + 1_000,
    );
    expect(state.misses).toBe(1);
    expect(state.lastMiss?.seq).toBe(1);
  });

  it("cancels a drop with no hover slot", () => {
    let state = startGame(createInitialMobileGameState(), 0);
    state = setHoverSlot(state, { dayIndex: 0, startMin: 10 * 60 });
    state = setHoverSlot(state, null);
    const dropped = dropPiece(state, 1_000);
    expect(dropped.misses).toBe(0);
    expect(dropped.pieceIndex).toBe(0);
    expect(dropped.score).toBe(0);
  });

  it("returns the same state for a hover on the already-hovered slot", () => {
    let state = startGame(createInitialMobileGameState(), 0);
    state = setHoverSlot(state, { dayIndex: 0, startMin: 10 * 60 });
    expect(setHoverSlot(state, { dayIndex: 0, startMin: 10 * 60 })).toBe(state);
  });

  it("skips from the intro straight to the end", () => {
    const state = skipToEnd(createInitialMobileGameState());
    expect(state.phase).toBe("ended");
    expect(state.skipped).toBe(true);
    expect(state.score).toBe(0);
  });

  it("only starts from the intro and only advances from a level clear", () => {
    const started = startGame(createInitialMobileGameState(), 0);
    expect(startGame(started, 5)).toBe(started);
    expect(advanceLevel(started, 5)).toBe(started);
    expect(skipToEnd(started)).toBe(started);
  });
});

describe("slotFromPointer", () => {
  // 480px tall for the 480-minute grid: 1px per minute, hour slots 60px.
  const rect = { left: 0, top: 0, width: 300, height: 480 };
  const levelOne = MOBILE_LEVELS[0] as (typeof MOBILE_LEVELS)[number];
  const levelThree = MOBILE_LEVELS[2] as (typeof MOBILE_LEVELS)[number];

  it("snaps the piece centered under the pointer", () => {
    // Pointer at 10:30; a 60-minute piece centered there starts at 10:00.
    expect(slotFromPointer(rect, 10, 90, levelOne, 60)).toEqual({
      dayIndex: 0,
      startMin: 10 * 60,
    });
  });

  it("resolves the day column and clamps horizontal drift", () => {
    expect(slotFromPointer(rect, 250, 90, levelThree, 60)?.dayIndex).toBe(2);
    expect(slotFromPointer(rect, -20, 90, levelThree, 60)?.dayIndex).toBe(0);
    expect(slotFromPointer(rect, 320, 90, levelThree, 60)?.dayIndex).toBe(2);
  });

  it("clamps to the bottom of the grid so the piece always fits", () => {
    expect(slotFromPointer(rect, 10, 479, levelOne, 60)).toEqual({
      dayIndex: 0,
      startMin: 16 * 60,
    });
  });

  it("returns null once the pointer is a slot height past the board", () => {
    expect(slotFromPointer(rect, 10, 545, levelOne, 60)).toBeNull();
    expect(slotFromPointer(rect, 10, 530, levelOne, 60)).not.toBeNull();
    expect(slotFromPointer(rect, 10, -70, levelOne, 60)).toBeNull();
  });
});
