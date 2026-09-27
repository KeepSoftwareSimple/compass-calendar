import {
  createInitialGameState,
  currentTask,
  type GameKey,
  type GameState,
  getDisplayKeycaps,
  getJumpLetters,
  getNextKeycapIndex,
  handleGameKey,
  isTaskComplete,
  resolveTypedTime,
  skipCurrentTask,
  startRun,
  tick,
} from "@web/components/ShortcutShowcase/game.state";
import {
  RUN_DURATION_MS,
  RUN_TASKS,
  SPEED_BONUS_POINTS,
  streakMultiplier,
  TASK_BASE_POINTS,
  TIME_BONUS_PER_SECOND,
} from "@web/components/ShortcutShowcase/game.tasks";
import { PRACTICE_NUDGE_MIN } from "@web/components/ShortcutShowcase/practice.state";
import { describe, expect, it } from "bun:test";

const T0 = 1_000_000;

const key = {
  create: { type: "create" } as GameKey,
  enter: { type: "enter" } as GameKey,
  del: { type: "delete" } as GameKey,
  undo: { type: "undo" } as GameKey,
  tab: { type: "tab", backward: false } as GameKey,
  legend: { type: "legend" } as GameKey,
  palette: { type: "palette" } as GameKey,
  jump: { type: "jump" } as GameKey,
  modHoldReveal: { type: "modHoldReveal" } as GameKey,
  modHoldEnd: { type: "modHoldEnd" } as GameKey,
  closeOverlay: { type: "closeOverlay" } as GameKey,
  letter: (letter: string): GameKey => ({ type: "letter", letter }),
  pageJumpDigit: (digit: string): GameKey => ({ type: "pageJumpDigit", digit }),
  digit: (digit: string): GameKey => ({ type: "digit", digit }),
  arrow: (
    direction: "up" | "down" | "left" | "right",
    shift = false,
  ): GameKey => ({ type: "arrow", direction, shift }),
};

/** The one keyboard script that clears the whole queue: 11 tasks, 23 keys. */
const WINNING_SCRIPT: GameKey[] = [
  // place-standup: spawn Tue 9:00, walk left, lock
  key.create,
  key.arrow("left"),
  key.enter,
  // quicktime-coffee: type 930, lock
  key.digit("9"),
  key.digit("3"),
  key.digit("0"),
  key.enter,
  // nudge-standup: 9:00 -> 9:15
  key.arrow("down", true),
  // resize-one-on-one: Tab to start edge, Shift+Up 10:00 -> 9:45
  key.tab,
  key.arrow("up", true),
  // delete-gym, undo-gym
  key.del,
  key.undo,
  // legend-peek: open, then Esc closes
  key.legend,
  key.closeOverlay,
  // jump-to-kickoff: reveal chips, jump by letter (kickoff is "s" by board order)
  key.jump,
  key.letter("s"),
  // page-jump-peek: the hold reveals, the digit lands
  key.modHoldReveal,
  key.pageJumpDigit("1"),
  // palette-peek: open, then Esc closes
  key.palette,
  key.closeOverlay,
  // place-party: spawn Wed 4:45pm, walk down to 5pm, lock
  key.create,
  key.arrow("down"),
  key.enter,
];

const playKeys = (
  state: GameState,
  keys: GameKey[],
  nowMs: number,
): GameState =>
  keys.reduce(
    (current, gameKey) => handleGameKey(current, gameKey, nowMs),
    state,
  );

describe("run lifecycle", () => {
  it("starts on Enter, pins nothing before the how-to card", () => {
    const initial = createInitialGameState();
    expect(handleGameKey(initial, key.create, T0)).toBe(initial);

    const running = startRun(initial, T0);
    expect(running.phase).toBe("running");
    // The default run is untimed practice: no clock is armed.
    expect(running.timed).toBe(false);
    expect(running.endsAtMs).toBe(0);
    expect(currentTask(running)?.id).toBe("place-standup");

    const timed = startRun(createInitialGameState(1, true), T0);
    expect(timed.endsAtMs).toBe(T0 + RUN_DURATION_MS);
  });

  it("clears the whole queue with the winning script and pays the timed bonus", () => {
    let state = startRun(createInitialGameState(1, true), T0);
    state = playKeys(state, WINNING_SCRIPT, T0 + 1_000);

    expect(state.phase).toBe("ended");
    expect(state.outcome).toBe("cleared");
    expect(state.tasksDone).toBe(RUN_TASKS.length);
    const remainingSeconds = Math.floor((RUN_DURATION_MS - 1_000) / 1000);
    expect(state.timeBonus).toBe(remainingSeconds * TIME_BONUS_PER_SECOND);
    expect(state.score).toBeGreaterThan(state.timeBonus);
  });

  it("pays no time bonus on an untimed run and never ticks", () => {
    let state = startRun(createInitialGameState(), T0);
    expect(tick(state, T0 + RUN_DURATION_MS * 10)).toBe(state);

    state = playKeys(state, WINNING_SCRIPT, T0 + RUN_DURATION_MS * 10);
    expect(state.phase).toBe("ended");
    expect(state.outcome).toBe("cleared");
    expect(state.timeBonus).toBe(0);
  });

  it("freezes the score at the buzzer and keeps the run going", () => {
    let state = startRun(createInitialGameState(1, true), T0);
    state = playKeys(state, WINNING_SCRIPT.slice(0, 3), T0 + 1_000);
    expect(state.tasksDone).toBe(1);

    const buzzed = tick(state, T0 + RUN_DURATION_MS);
    expect(buzzed.phase).toBe("running");
    expect(buzzed.buzzer).toEqual({ score: state.score, tasksDone: 1 });
    // A second tick does not re-snapshot.
    expect(tick(buzzed, T0 + RUN_DURATION_MS + 1_000)).toBe(buzzed);

    // Finishing after the buzzer is overtime: full run, no time bonus.
    const finished = playKeys(
      buzzed,
      WINNING_SCRIPT.slice(3),
      T0 + RUN_DURATION_MS + 5_000,
    );
    expect(finished.phase).toBe("ended");
    expect(finished.outcome).toBe("overtime");
    expect(finished.tasksDone).toBe(RUN_TASKS.length);
    expect(finished.timeBonus).toBe(0);
    expect(finished.buzzer).toEqual(buzzed.buzzer);
  });
});

describe("task skip", () => {
  it("advances with no points, resets the streak, and re-enters the next task", () => {
    let state = startRun(createInitialGameState(), T0);
    state = playKeys(state, WINNING_SCRIPT.slice(0, 3), T0);
    expect(state.streak).toBe(1);
    const scoreBefore = state.score;

    const skipped = skipCurrentTask(state, T0 + 1_000);
    expect(currentTask(skipped)?.id).toBe("nudge-standup");
    expect(skipped.score).toBe(scoreBefore);
    expect(skipped.tasksSkipped).toBe(1);
    expect(skipped.streak).toBe(0);
  });

  it("skipping every task ends the run with no points and no bonus", () => {
    let state = startRun(createInitialGameState(1, true), T0);
    for (let i = 0; i < RUN_TASKS.length; i += 1) {
      state = skipCurrentTask(state, T0 + i);
    }
    expect(state.phase).toBe("ended");
    expect(state.outcome).toBe("cleared");
    expect(state.tasksDone).toBe(0);
    expect(state.tasksSkipped).toBe(RUN_TASKS.length);
    expect(state.score).toBe(0);
    expect(state.timeBonus).toBe(0);
    // Ended runs ignore further skips.
    expect(skipCurrentTask(state, T0)).toBe(state);
  });
});

describe("scoring", () => {
  it("maps consecutive speed clears onto x2 then x3", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(2)).toBe(1);
    expect(streakMultiplier(3)).toBe(2);
    expect(streakMultiplier(5)).toBe(2);
    expect(streakMultiplier(6)).toBe(3);
  });

  it("pays the speed bonus and multiplies streaks of fast clears", () => {
    let state = startRun(createInitialGameState(), T0);
    // Three instant clears: 150, 150, then streak hits 3 -> x2.
    state = playKeys(state, WINNING_SCRIPT.slice(0, 8), T0);
    expect(state.tasksDone).toBe(3);
    const fast = TASK_BASE_POINTS + SPEED_BONUS_POINTS;
    expect(state.score).toBe(fast + fast + fast * 2);
    expect(state.streak).toBe(3);
  });

  it("resets the streak on a slow clear and drops the bonus", () => {
    let state = startRun(createInitialGameState(), T0);
    state = playKeys(state, WINNING_SCRIPT.slice(0, 3), T0 + 20_000);
    expect(state.tasksDone).toBe(1);
    expect(state.streak).toBe(0);
    expect(state.score).toBe(TASK_BASE_POINTS);
  });
});

describe("task validation", () => {
  it("does not complete a place task until the piece is locked on target", () => {
    let state = startRun(createInitialGameState(), T0);
    state = playKeys(state, [key.create, key.arrow("left")], T0);
    // On target but still placing.
    expect(currentTask(state)?.id).toBe("place-standup");
    state = handleGameKey(state, key.enter, T0);
    expect(currentTask(state)?.id).toBe("quicktime-coffee");
  });

  it("lets a piece locked in the wrong slot be nudged home afterwards", () => {
    let state = startRun(createInitialGameState(), T0);
    // Lock immediately at the Tuesday spawn slot: wrong day.
    state = playKeys(state, [key.create, key.enter], T0);
    expect(currentTask(state)?.id).toBe("place-standup");
    // C must not respawn the locked piece.
    const beforeRespawn = state;
    expect(handleGameKey(state, key.create, T0)).toBe(beforeRespawn);
    // Shift+Left walks the locked block home and completes the task.
    state = handleGameKey(state, key.arrow("left", true), T0);
    expect(currentTask(state)?.id).toBe("quicktime-coffee");
  });

  it("requires the start edge for the resize task: whole-block moves fail", () => {
    let state = startRun(createInitialGameState(), T0);
    state = playKeys(state, WINNING_SCRIPT.slice(0, 8), T0);
    expect(currentTask(state)?.id).toBe("resize-one-on-one");

    // Whole-block Shift+Up moves 10:00-10:30 -> 9:45-10:15; not a resize.
    state = handleGameKey(state, key.arrow("up", true), T0);
    expect(currentTask(state)?.id).toBe("resize-one-on-one");

    // Recover, then do it properly via the start edge.
    state = playKeys(
      state,
      [key.arrow("down", true), key.tab, key.arrow("up", true)],
      T0,
    );
    expect(currentTask(state)?.id).toBe("delete-gym");
  });

  it("restores the scripted delete with undo", () => {
    let state = startRun(createInitialGameState(), T0);
    state = playKeys(state, WINNING_SCRIPT.slice(0, 10), T0);
    expect(currentTask(state)?.id).toBe("delete-gym");

    state = handleGameKey(state, key.del, T0);
    expect(currentTask(state)?.id).toBe("undo-gym");
    expect(state.practice.events.some((e) => e.id === "game-gym")).toBe(false);

    state = handleGameKey(state, key.undo, T0);
    expect(currentTask(state)?.id).toBe("legend-peek");
    expect(state.practice.events.some((e) => e.id === "game-gym")).toBe(true);
  });
});

describe("discovery tasks", () => {
  /** Play up to (and including) undo-gym so legend-peek is current. */
  const reachLegend = () =>
    playKeys(
      startRun(createInitialGameState(), T0),
      WINNING_SCRIPT.slice(0, 12),
      T0,
    );

  it("completes the legend by opening with ? and closing with Esc", () => {
    let state = reachLegend();
    expect(currentTask(state)?.id).toBe("legend-peek");

    state = handleGameKey(state, key.legend, T0);
    expect(state.simOverlay).toBe("legend");
    expect(currentTask(state)?.id).toBe("legend-peek");

    state = handleGameKey(state, key.closeOverlay, T0);
    expect(currentTask(state)?.id).toBe("jump-to-kickoff");
  });

  it("jumps by letter; wrong letters leave the task open for another try", () => {
    let state = playKeys(reachLegend(), [key.legend, key.legend], T0);
    expect(currentTask(state)?.id).toBe("jump-to-kickoff");
    // The undo beat left Gym focused; being focused is not the task.
    expect(state.practice.focusedId).toBe("game-gym");

    state = handleGameKey(state, key.jump, T0);
    expect(state.jumpChipsShown).toBe(true);
    expect(getJumpLetters(state.practice)["game-kickoff"]).toBe("s");

    // A letter with no block is a no-op; a wrong block closes the chips
    // but leaves the task open.
    expect(handleGameKey(state, key.letter("z"), T0)).toBe(state);
    state = handleGameKey(state, key.letter("g"), T0);
    expect(currentTask(state)?.id).toBe("jump-to-kickoff");

    state = playKeys(state, [key.jump, key.letter("s")], T0);
    expect(currentTask(state)?.id).toBe("page-jump-peek");
    expect(state.practice.focusedId).toBe("game-kickoff");
  });

  it("aborts the page-jump reveal when Mod is released without a digit", () => {
    let state = playKeys(
      reachLegend(),
      [key.legend, key.legend, key.jump, key.letter("s")],
      T0,
    );
    expect(currentTask(state)?.id).toBe("page-jump-peek");

    state = playKeys(state, [key.modHoldReveal, key.modHoldEnd], T0);
    expect(currentTask(state)?.id).toBe("page-jump-peek");
    expect(state.simOverlay).toBeNull();

    state = playKeys(state, [key.modHoldReveal, key.pageJumpDigit("1")], T0);
    expect(currentTask(state)?.id).toBe("palette-peek");
  });
});

describe("keycap progress", () => {
  it("walks the place chips: create, arrow while placing, enter on target", () => {
    let state = startRun(createInitialGameState(), T0);
    const task = currentTask(state) as NonNullable<
      ReturnType<typeof currentTask>
    >;
    expect(getNextKeycapIndex(task, state)).toBe(0);

    state = handleGameKey(state, key.create, T0);
    expect(getNextKeycapIndex(task, state)).toBe(1);

    state = handleGameKey(state, key.arrow("left"), T0);
    expect(getNextKeycapIndex(task, state)).toBe(2);
  });

  it("tracks typed digits and points at Enter once the piece spawns", () => {
    let state = playKeys(
      startRun(createInitialGameState(), T0),
      WINNING_SCRIPT.slice(0, 3),
      T0,
    );
    const task = currentTask(state) as NonNullable<
      ReturnType<typeof currentTask>
    >;
    expect(task.id).toBe("quicktime-coffee");
    expect(getNextKeycapIndex(task, state)).toBe(0);

    state = playKeys(state, [key.digit("9"), key.digit("3")], T0);
    expect(getNextKeycapIndex(task, state)).toBe(2);

    state = handleGameKey(state, key.digit("0"), T0);
    // Spawned at 9:30, still placing: Enter is the last chip.
    expect(getNextKeycapIndex(task, state)).toBe(task.keycaps.length - 1);
  });

  it("tabs once to the start edge, then pulses Shift+Up on the last chip", () => {
    let state = playKeys(
      startRun(createInitialGameState(), T0),
      WINNING_SCRIPT.slice(0, 8),
      T0,
    );
    const task = currentTask(state) as NonNullable<
      ReturnType<typeof currentTask>
    >;
    expect(task.id).toBe("resize-one-on-one");
    expect(getNextKeycapIndex(task, state)).toBe(0);

    state = handleGameKey(state, key.tab, T0);
    // Start edge focused: past the held Shift, onto the last chip.
    expect(getNextKeycapIndex(task, state)).toBe(task.keycaps.length - 1);
    expect(getNextKeycapIndex(task, state)).toBe(2);
  });

  it("pulses the Shift+Down chip on the one-press nudge card", () => {
    const state = playKeys(
      startRun(createInitialGameState(), T0),
      WINNING_SCRIPT.slice(0, 7),
      T0,
    );
    const task = currentTask(state) as NonNullable<
      ReturnType<typeof currentTask>
    >;
    expect(task.id).toBe("nudge-standup");
    // One press to go: the Down chip, past the held Shift.
    expect(getNextKeycapIndex(task, state)).toBe(1);
  });

  it("shows the jump target's live letter on the card and pulses it after H", () => {
    let state = playKeys(
      startRun(createInitialGameState(), T0),
      WINNING_SCRIPT.slice(0, 14),
      T0,
    );
    const task = currentTask(state) as NonNullable<
      ReturnType<typeof currentTask>
    >;
    expect(task.id).toBe("jump-to-kickoff");
    // The full sequence is on the card up front: H, then kickoff's letter.
    expect(getDisplayKeycaps(task, state)).toEqual(["H", "S"]);
    expect(getNextKeycapIndex(task, state)).toBe(0);

    state = handleGameKey(state, key.jump, T0);
    expect(getNextKeycapIndex(task, state)).toBe(1);
  });

  it("swaps the palette card's hint to Esc while the sim palette is open", () => {
    let state = playKeys(
      startRun(createInitialGameState(), T0),
      WINNING_SCRIPT.slice(0, 18),
      T0,
    );
    const task = currentTask(state) as NonNullable<
      ReturnType<typeof currentTask>
    >;
    expect(task.id).toBe("palette-peek");
    expect(getDisplayKeycaps(task, state)).toEqual(task.keycaps);

    state = handleGameKey(state, key.palette, T0);
    expect(getDisplayKeycaps(task, state)).toEqual(["Esc"]);
    expect(getNextKeycapIndex(task, state)).toBe(0);
  });

  it("swaps the legend card's hint to Esc while the sim legend is open", () => {
    let state = playKeys(
      startRun(createInitialGameState(), T0),
      WINNING_SCRIPT.slice(0, 12),
      T0,
    );
    const task = currentTask(state) as NonNullable<
      ReturnType<typeof currentTask>
    >;
    expect(task.id).toBe("legend-peek");
    expect(getDisplayKeycaps(task, state)).toEqual(["?"]);

    state = handleGameKey(state, key.legend, T0);
    expect(getDisplayKeycaps(task, state)).toEqual(["Esc"]);
    expect(getNextKeycapIndex(task, state)).toBe(0);
  });
});

describe("typed times", () => {
  it("resolves 4-digit and 3-digit quarter-hour times inside the grid", () => {
    expect(resolveTypedTime("1230")).toBe(12 * 60 + 30);
    expect(resolveTypedTime("830")).toBe(8 * 60 + 30);
    expect(resolveTypedTime("915")).toBe(9 * 60 + 15);
    expect(resolveTypedTime("930")).toBe(9 * 60 + 30);
    // Not quarter-hour aligned, or outside the 8am-6pm grid.
    expect(resolveTypedTime("1234")).toBeNull();
    expect(resolveTypedTime("0700")).toBeNull();
    expect(resolveTypedTime("1800")).toBeNull();
  });

  it("keeps a promising buffer and clears a hopeless one", () => {
    let state = startRun(createInitialGameState(), T0);
    state = playKeys(state, WINNING_SCRIPT.slice(0, 3), T0);
    expect(currentTask(state)?.id).toBe("quicktime-coffee");

    state = playKeys(state, [key.digit("9"), key.digit("3")], T0);
    expect(state.digitBuffer).toBe("93");
    // "931" cannot extend to any valid quarter-hour time.
    state = handleGameKey(state, key.digit("1"), T0);
    expect(state.digitBuffer).toBe("");
  });

  it("commits a short hour buffer with Enter", () => {
    let state = startRun(createInitialGameState(), T0);
    state = playKeys(state, WINNING_SCRIPT.slice(0, 3), T0);
    state = playKeys(state, [key.digit("9"), key.enter], T0);
    // Spawned at 9:00 (placing); not yet at the 9:30 target.
    const coffee = state.practice.events.find((e) => e.id === "piece-coffee");
    expect(coffee?.startMin).toBe(9 * 60);
    expect(state.practice.placingId).toBe("piece-coffee");

    state = playKeys(
      state,
      [key.arrow("down"), key.arrow("down"), key.enter],
      T0,
    );
    expect(currentTask(state)?.id).toBe("nudge-standup");
  });
});

describe("winning script sanity", () => {
  it("every task in the queue has a reachable, well-formed target", () => {
    const state = startRun(createInitialGameState(), T0);
    for (const task of RUN_TASKS) {
      expect(isTaskComplete(task, state)).toBe(
        // Only already-satisfied tasks would be undo of something present.
        task.type === "undo",
      );
    }
  });

  it("every task carries a stall hint", () => {
    for (const task of RUN_TASKS) {
      expect(task.hint.length).toBeGreaterThan(0);
    }
  });

  it("never repeats a key and arrow chips match spawn-to-target distance", () => {
    expect(WINNING_SCRIPT).toHaveLength(23);
    expect(RUN_TASKS).toHaveLength(11);

    for (const task of RUN_TASKS) {
      for (let i = 1; i < task.keycaps.length; i += 1) {
        expect(task.keycaps[i]).not.toBe(task.keycaps[i - 1]);
      }
    }

    let state = startRun(createInitialGameState(), T0);
    let keyIndex = 0;
    for (const task of RUN_TASKS) {
      if (task.type === "place") {
        const arrowCount = task.keycaps.length - 2;
        const distance =
          Math.abs(task.spawn.dayIndex - task.target.dayIndex) +
          Math.abs(task.spawn.startMin - task.target.startMin) /
            PRACTICE_NUDGE_MIN;
        expect(arrowCount).toBe(distance);
      }
      if (task.type === "nudge" || task.type === "resize") {
        const block = state.practice.events.find(
          (event) => event.id === task.targetEventId,
        );
        expect(block).toBeTruthy();
        if (!block) return;
        const shiftIndex = task.keycaps.indexOf("Shift");
        const arrowCount = task.keycaps.length - shiftIndex - 1;
        const fromMin =
          task.type === "resize" && task.edge === "start"
            ? block.startMin
            : task.type === "resize"
              ? block.endMin
              : block.startMin;
        const toMin =
          task.type === "resize" && task.edge === "start"
            ? task.target.startMin
            : task.type === "resize"
              ? task.target.endMin
              : task.target.startMin;
        const distance =
          Math.abs(block.dayIndex - task.target.dayIndex) +
          Math.abs(fromMin - toMin) / PRACTICE_NUDGE_MIN;
        expect(arrowCount).toBe(distance);
      }

      const startIndex = state.taskIndex;
      while (
        state.taskIndex === startIndex &&
        keyIndex < WINNING_SCRIPT.length
      ) {
        const nextKey = WINNING_SCRIPT[keyIndex];
        if (!nextKey) break;
        state = handleGameKey(state, nextKey, T0);
        keyIndex += 1;
      }
      expect(state.taskIndex).toBe(startIndex + 1);
    }
  });
});
