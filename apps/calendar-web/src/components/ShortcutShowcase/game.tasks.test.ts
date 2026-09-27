import {
  SPEED_BONUS_MS,
  SPEED_BONUS_POINTS,
  scorePlacement,
  streakMultiplier,
  TASK_BASE_POINTS,
} from "@web/components/ShortcutShowcase/game.tasks";
import { describe, expect, it } from "bun:test";

describe("scorePlacement", () => {
  it("awards base plus speed bonus and grows the streak when under the cutoff", () => {
    expect(scorePlacement(0, SPEED_BONUS_MS)).toEqual({
      speedy: true,
      streak: 1,
      points: TASK_BASE_POINTS + SPEED_BONUS_POINTS,
    });
  });

  it("resets the streak and drops the speed bonus when over the cutoff", () => {
    expect(scorePlacement(5, SPEED_BONUS_MS + 1)).toEqual({
      speedy: false,
      streak: 0,
      points: TASK_BASE_POINTS,
    });
  });

  it("applies the same streak multipliers as the HUD", () => {
    expect(scorePlacement(2, 0).points).toBe(
      (TASK_BASE_POINTS + SPEED_BONUS_POINTS) * streakMultiplier(3),
    );
    expect(scorePlacement(5, 0).points).toBe(
      (TASK_BASE_POINTS + SPEED_BONUS_POINTS) * streakMultiplier(6),
    );
  });
});
