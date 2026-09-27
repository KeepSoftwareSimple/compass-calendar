import {
  GAME_SEED_EVENTS,
  type GameSlot,
  type GameTask,
  RUN_DURATION_MS,
  RUN_TASKS,
  scorePlacement,
  TIME_BONUS_PER_SECOND,
} from "@web/components/ShortcutShowcase/game.tasks";
import {
  createPracticeState,
  cycleEdgeFocus,
  deleteFocused,
  focusEvent,
  lockPlacing,
  nudgeFocused,
  PRACTICE_GRID_END_MIN,
  PRACTICE_GRID_START_MIN,
  PRACTICE_NUDGE_MIN,
  type PracticeNudgeDirection,
  type PracticeState,
  spawnPiece,
  undoDelete,
} from "@web/components/ShortcutShowcase/practice.state";

/**
 * The Block Party reducer. Every function is pure and every timestamp
 * arrives as an argument (no Date.now() in here), so a full run scripts
 * cleanly in tests without fake timers.
 */

export type GamePhase = "howto" | "running" | "ended";
/** Overtime: the queue was finished after a timed run's clock hit zero. */
export type GameOutcome = "cleared" | "overtime";

/** A simulated overlay for the discovery tasks; never the real component. */
export type GameSimOverlay = "legend" | "pagejump" | "palette";

/** Keyboard input, already translated from the DOM event by the component. */
export type GameKey =
  | { type: "create" }
  | { type: "digit"; digit: string }
  | { type: "arrow"; direction: PracticeNudgeDirection; shift: boolean }
  | { type: "tab"; backward: boolean }
  | { type: "enter" }
  | { type: "delete" }
  | { type: "undo" }
  | { type: "legend" }
  | { type: "palette" }
  | { type: "jump" }
  | { type: "letter"; letter: string }
  | { type: "modHoldReveal" }
  | { type: "modHoldEnd" }
  | { type: "pageJumpDigit"; digit: string }
  | { type: "closeOverlay" };

export type GameAward = {
  seq: number;
  points: number;
  taskId: string;
  elapsedMs: number;
};

export type GameState = {
  phase: GamePhase;
  outcome: GameOutcome | null;
  practice: PracticeState;
  taskIndex: number;
  tasksDone: number;
  score: number;
  /** Consecutive speed-bonus clears; resets on a slow clear. */
  streak: number;
  /** Remaining-seconds points granted on a full clear. */
  timeBonus: number;
  /** Pending quick-time digits for the current task. */
  digitBuffer: string;
  startedAtMs: number;
  endsAtMs: number;
  /** When the run actually ended (cleared or time-up); 0 while running. */
  endedAtMs: number;
  taskStartedAtMs: number;
  /** Seq bumps on every award so the UI can key the score popup. */
  lastAward: GameAward | null;
  runCount: number;
  /** False on a practice run: no clock, no time bonus. */
  timed: boolean;
  /** Timed-run score frozen the moment the clock hit zero. */
  buzzer: { score: number; tasksDone: number } | null;
  /** Tasks skipped with Esc; shown on the end screen, worth no points. */
  tasksSkipped: number;
  /** Simulated overlay for the discovery tasks. */
  simOverlay: GameSimOverlay | null;
  /** True once the current task's reveal step happened; reset per task. */
  simOverlayOpened: boolean;
  /** Jump-letter chips visible on the practice blocks (the H task). */
  jumpChipsShown: boolean;
};

export const createInitialGameState = (
  runCount = 1,
  timed = false,
): GameState => ({
  phase: "howto",
  outcome: null,
  practice: createPracticeState(
    GAME_SEED_EVENTS.map((event) => ({ ...event })),
  ),
  taskIndex: 0,
  tasksDone: 0,
  score: 0,
  streak: 0,
  timeBonus: 0,
  digitBuffer: "",
  startedAtMs: 0,
  endsAtMs: 0,
  endedAtMs: 0,
  taskStartedAtMs: 0,
  lastAward: null,
  runCount,
  timed,
  buzzer: null,
  tasksSkipped: 0,
  simOverlay: null,
  simOverlayOpened: false,
  jumpChipsShown: false,
});

export const currentTask = (state: GameState): GameTask | null =>
  RUN_TASKS[state.taskIndex] ?? null;

/** Pin focus to a task's target so Shift+Arrow/Delete land without hunting. */
const enterTask = (state: GameState): GameState => {
  const task = currentTask(state);
  const next = {
    ...state,
    digitBuffer: "",
    simOverlay: null,
    simOverlayOpened: false,
    jumpChipsShown: false,
  };
  // undo needs the block gone; eventJump would self-complete if pre-focused.
  if (
    task &&
    "targetEventId" in task &&
    task.type !== "undo" &&
    task.type !== "eventJump"
  ) {
    return { ...next, practice: focusEvent(next.practice, task.targetEventId) };
  }
  return next;
};

export const startRun = (state: GameState, nowMs: number): GameState => {
  if (state.phase !== "howto") return state;
  return enterTask({
    ...state,
    phase: "running",
    startedAtMs: nowMs,
    endsAtMs: state.timed ? nowMs + RUN_DURATION_MS : 0,
    taskStartedAtMs: nowMs,
  });
};

/**
 * The buzzer is a soft landing, not an exit: when a timed run's clock hits
 * zero the score freezes into `buzzer` and play continues untimed, so the
 * player never loses their run to the clock.
 */
export const tick = (state: GameState, nowMs: number): GameState =>
  state.phase === "running" &&
  state.timed &&
  !state.buzzer &&
  nowMs >= state.endsAtMs
    ? { ...state, buzzer: { score: state.score, tasksDone: state.tasksDone } }
    : state;

const blockById = (practice: PracticeState, id: string) =>
  practice.events.find((event) => event.id === id);

/**
 * Letters shown on the blocks while jump chips are up, keyed by event id and
 * ordered by board position. The pool avoids letters the takeover already
 * binds (c create, h jump, u signup, plus the end screen's o/p and the e/t
 * edit sequence).
 */
const JUMP_LETTER_POOL = "asdfgjkl";

export const getJumpLetters = (
  practice: PracticeState,
): Record<string, string> => {
  const ordered = [...practice.events].sort(
    (a, b) =>
      a.dayIndex - b.dayIndex ||
      a.startMin - b.startMin ||
      a.id.localeCompare(b.id),
  );
  const letters: Record<string, string> = {};
  ordered.slice(0, JUMP_LETTER_POOL.length).forEach((event, index) => {
    letters[event.id] = JUMP_LETTER_POOL[index] as string;
  });
  return letters;
};

const matchesSlot = (
  block: { dayIndex: number; startMin: number; endMin: number },
  slot: { dayIndex: number; startMin: number; endMin: number },
) =>
  block.dayIndex === slot.dayIndex &&
  block.startMin === slot.startMin &&
  block.endMin === slot.endMin;

export const isTaskComplete = (task: GameTask, state: GameState): boolean => {
  const { practice } = state;
  switch (task.type) {
    case "place":
    case "quickTime": {
      const block = blockById(practice, task.piece.id);
      // Reaching the slot while still placing doesn't count: Enter locks.
      return (
        Boolean(block) &&
        practice.placingId !== task.piece.id &&
        matchesSlot(block as NonNullable<typeof block>, task.target)
      );
    }
    case "nudge":
    case "resize": {
      const block = blockById(practice, task.targetEventId);
      return (
        Boolean(block) &&
        matchesSlot(block as NonNullable<typeof block>, task.target)
      );
    }
    case "delete":
      return !blockById(practice, task.targetEventId);
    case "undo":
      return Boolean(blockById(practice, task.targetEventId));
    // Opened, then closed: the reveal-and-dismiss is the whole lesson.
    case "legend":
    case "pageJump":
    case "palette":
      return state.simOverlayOpened && state.simOverlay === null;
    case "eventJump":
      return (
        state.simOverlayOpened &&
        !state.jumpChipsShown &&
        practice.focusedId === task.targetEventId
      );
  }
};

/**
 * Sandbox quick-time: the grid runs 8am-6pm so there is no meridiem
 * ambiguity and no commit timer. 3-4 digits resolve as H:MM/HH:MM the moment
 * they form a valid quarter-hour start inside the grid; 1-2 digits resolve
 * as a whole hour via Enter.
 */
const timeFromParts = (hour: number, minute: number): number | null => {
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (minute >= 60 || minute % PRACTICE_NUDGE_MIN !== 0) return null;
  const startMin = hour * 60 + minute;
  if (startMin < PRACTICE_GRID_START_MIN) return null;
  if (startMin + PRACTICE_NUDGE_MIN > PRACTICE_GRID_END_MIN) return null;
  return startMin;
};

export const resolveTypedTime = (buffer: string): number | null => {
  if (buffer.length === 4) {
    return timeFromParts(Number(buffer.slice(0, 2)), Number(buffer.slice(2)));
  }
  if (buffer.length === 3) {
    return timeFromParts(Number(buffer.slice(0, 1)), Number(buffer.slice(1)));
  }
  return null;
};

/** Enter commits a short buffer as a whole hour ("9" -> 9:00, "12" -> 12:00). */
export const resolveTypedTimeEagerly = (buffer: string): number | null => {
  if (buffer.length === 1 || buffer.length === 2) {
    return timeFromParts(Number(buffer), 0);
  }
  return resolveTypedTime(buffer);
};

/** Could more digits (or Enter) still turn this buffer into a valid time? */
const canBecomeValidTime = (buffer: string): boolean => {
  if (buffer.length === 0) return false;
  if (resolveTypedTimeEagerly(buffer) !== null) return true;
  if (buffer.length >= 4) return false;
  for (let digit = 0; digit <= 9; digit += 1) {
    if (canBecomeValidTime(`${buffer}${digit}`)) return true;
  }
  return false;
};

const spawnTypedPiece = (
  state: GameState,
  task: Extract<GameTask, { type: "quickTime" }>,
  startMin: number,
): GameState => {
  const duration = task.target.endMin - task.target.startMin;
  const endMin = Math.min(PRACTICE_GRID_END_MIN, startMin + duration);
  return {
    ...state,
    digitBuffer: "",
    practice: spawnPiece(state.practice, {
      ...task.piece,
      dayIndex: task.target.dayIndex,
      startMin,
      endMin,
    }),
  };
};

const applyKey = (state: GameState, key: GameKey): GameState => {
  const task = currentTask(state);
  if (!task) return state;
  const { practice } = state;

  switch (key.type) {
    case "create": {
      if (task.type !== "place") return state;
      // Re-pressing C after a lock must not respawn a placed piece.
      if (practice.placingId || blockById(practice, task.piece.id)) {
        return state;
      }
      return {
        ...state,
        practice: spawnPiece(practice, { ...task.piece, ...task.spawn }),
      };
    }
    case "digit": {
      if (task.type !== "quickTime") return state;
      if (practice.placingId || blockById(practice, task.piece.id)) {
        return state;
      }
      const buffer = state.digitBuffer + key.digit;
      const startMin = resolveTypedTime(buffer);
      if (startMin !== null) return spawnTypedPiece(state, task, startMin);
      return {
        ...state,
        digitBuffer: canBecomeValidTime(buffer) ? buffer : "",
      };
    }
    case "arrow": {
      // Plain arrows move an open piece (like the real grid's draft);
      // Shift+Arrow nudges whatever is focused, placing or locked.
      if (!practice.placingId && !key.shift) return state;
      const next = nudgeFocused(practice, key.direction);
      return next === practice ? state : { ...state, practice: next };
    }
    case "tab": {
      if (practice.placingId) return state;
      return {
        ...state,
        practice: cycleEdgeFocus(
          practice,
          key.backward ? "backward" : "forward",
        ),
      };
    }
    case "enter": {
      if (practice.placingId) {
        return { ...state, practice: lockPlacing(practice) };
      }
      if (task.type === "quickTime" && state.digitBuffer) {
        const startMin = resolveTypedTimeEagerly(state.digitBuffer);
        if (startMin === null) return { ...state, digitBuffer: "" };
        return spawnTypedPiece(state, task, startMin);
      }
      return state;
    }
    case "delete": {
      const next = deleteFocused(practice);
      return next === practice ? state : { ...state, practice: next };
    }
    case "undo": {
      const next = undoDelete(practice);
      return next === practice ? state : { ...state, practice: next };
    }
    case "legend":
      return toggleDiscoveryOverlay(state, "legend", task);
    case "palette":
      return toggleDiscoveryOverlay(state, "palette", task);
    case "jump": {
      if (task.type !== "eventJump") return state;
      return {
        ...state,
        jumpChipsShown: !state.jumpChipsShown,
        simOverlayOpened: true,
      };
    }
    case "letter": {
      if (!state.jumpChipsShown) return state;
      const letters = getJumpLetters(practice);
      const targetId = Object.keys(letters).find(
        (id) => letters[id] === key.letter,
      );
      if (!targetId) return state;
      return {
        ...state,
        jumpChipsShown: false,
        practice: focusEvent(practice, targetId),
      };
    }
    case "modHoldReveal": {
      if (task.type !== "pageJump" || state.simOverlay) return state;
      return { ...state, simOverlay: "pagejump", simOverlayOpened: true };
    }
    case "modHoldEnd": {
      // Releasing Mod without a digit closes the reveal and resets the
      // opened flag: the taught gesture is hold, then digit.
      if (state.simOverlay !== "pagejump") return state;
      return { ...state, simOverlay: null, simOverlayOpened: false };
    }
    case "pageJumpDigit": {
      if (state.simOverlay !== "pagejump") return state;
      if (key.digit !== "1" && key.digit !== "2") return state;
      return { ...state, simOverlay: null };
    }
    case "closeOverlay": {
      if (!state.simOverlay) return state;
      // Esc aborts the page-jump reveal (Mod is still held); on the legend
      // and palette it is a taught way to close them, so it completes.
      return state.simOverlay === "pagejump"
        ? { ...state, simOverlay: null, simOverlayOpened: false }
        : { ...state, simOverlay: null };
    }
  }
};

const toggleDiscoveryOverlay = (
  state: GameState,
  kind: Extract<GameSimOverlay, "legend" | "palette">,
  task: GameTask,
): GameState => {
  if (state.simOverlay === kind) return { ...state, simOverlay: null };
  if (task.type !== kind || state.simOverlay) return state;
  return { ...state, simOverlay: kind, simOverlayOpened: true };
};

const finishRun = (
  state: GameState,
  nowMs: number,
  { applyTimeBonus }: { applyTimeBonus: boolean },
): GameState => {
  // The time bonus needs a timed run finished before the buzzer with no
  // skips, or Esc-ing through tasks would farm remaining seconds.
  const fullClear =
    applyTimeBonus &&
    state.timed &&
    !state.buzzer &&
    state.tasksDone === RUN_TASKS.length;
  const remainingSeconds = fullClear
    ? Math.max(0, Math.floor((state.endsAtMs - nowMs) / 1000))
    : 0;
  const timeBonus = remainingSeconds * TIME_BONUS_PER_SECOND;
  return {
    ...state,
    phase: "ended",
    outcome: state.buzzer ? "overtime" : "cleared",
    endedAtMs: nowMs,
    ...(applyTimeBonus ? { timeBonus, score: state.score + timeBonus } : {}),
  };
};

const advanceOrFinish = (
  advanced: GameState,
  nowMs: number,
  options: { applyTimeBonus: boolean },
): GameState =>
  advanced.taskIndex >= RUN_TASKS.length
    ? finishRun(advanced, nowMs, options)
    : enterTask(advanced);

const completeIfDone = (state: GameState, nowMs: number): GameState => {
  const task = currentTask(state);
  if (!task || !isTaskComplete(task, state)) return state;

  const elapsed = nowMs - state.taskStartedAtMs;
  const { streak, points } = scorePlacement(state.streak, elapsed);

  const advanced: GameState = {
    ...state,
    score: state.score + points,
    streak,
    tasksDone: state.tasksDone + 1,
    taskIndex: state.taskIndex + 1,
    taskStartedAtMs: nowMs,
    lastAward: {
      seq: (state.lastAward?.seq ?? 0) + 1,
      points,
      taskId: task.id,
      elapsedMs: elapsed,
    },
  };

  return advanceOrFinish(advanced, nowMs, { applyTimeBonus: true });
};

/**
 * Esc mid-run: advance past the current task with no points. Skipping the
 * last task ends the run through the same outcome logic as a clear.
 */
export const skipCurrentTask = (state: GameState, nowMs: number): GameState => {
  if (state.phase !== "running" || !currentTask(state)) return state;
  const advanced: GameState = {
    ...state,
    taskIndex: state.taskIndex + 1,
    tasksSkipped: state.tasksSkipped + 1,
    streak: 0,
    taskStartedAtMs: nowMs,
  };
  return advanceOrFinish(advanced, nowMs, { applyTimeBonus: false });
};

export const handleGameKey = (
  state: GameState,
  key: GameKey,
  nowMs: number,
): GameState => {
  if (state.phase !== "running") return state;
  const next = applyKey(state, key);
  if (next === state) return state;
  return completeIfDone(next, nowMs);
};

/**
 * The chips the task card shows. Usually the task's static keycaps, but a
 * card can change chips as the move unfolds: the jump card carries the
 * target's live letter (assigned by board order, so it shifts with skips),
 * and the palette and legend cards swap to Esc once those overlays are open.
 */
export const getDisplayKeycaps = (
  task: GameTask,
  state: GameState,
): readonly string[] => {
  if (task.type === "eventJump") {
    const letter = getJumpLetters(state.practice)[task.targetEventId];
    return letter ? [...task.keycaps, letter.toUpperCase()] : task.keycaps;
  }
  if (
    (task.type === "palette" && state.simOverlay === "palette") ||
    (task.type === "legend" && state.simOverlay === "legend")
  ) {
    return ["Esc"];
  }
  return task.keycaps;
};

/** Whole-block presses left to reach a slot: day taps plus 15-minute taps. */
const pressesRemaining = (
  block: { dayIndex: number; startMin: number },
  target: GameSlot,
): number =>
  Math.abs(block.dayIndex - target.dayIndex) +
  Math.abs(block.startMin - target.startMin) / PRACTICE_NUDGE_MIN;

/**
 * Which display chip the player should press next, so the task card can dim
 * what's done and pulse what's expected. Chips are authored one per press,
 * and progress is derived entirely from the board, so a wrong turn
 * self-corrects. Indexes into `getDisplayKeycaps`: for the H task,
 * `task.keycaps.length` is the appended letter chip.
 */
export const getNextKeycapIndex = (
  task: GameTask,
  state: GameState,
): number => {
  const { practice } = state;
  switch (task.type) {
    case "place": {
      const block = blockById(practice, task.piece.id);
      if (!block) return 0;
      if (
        practice.placingId === task.piece.id &&
        !matchesSlot(block, task.target)
      ) {
        // Walk the arrow chips (indexes 1..arrowCount) as the piece closes in.
        const arrowCount = task.keycaps.length - 2;
        const remaining = pressesRemaining(block, task.target);
        return Math.min(1 + Math.max(arrowCount - remaining, 0), arrowCount);
      }
      return task.keycaps.length - 1;
    }
    case "quickTime": {
      const enterIndex = task.keycaps.length - 1;
      if (blockById(practice, task.piece.id)) return enterIndex;
      return Math.min(state.digitBuffer.length, enterIndex - 1);
    }
    case "nudge": {
      const block = blockById(practice, task.targetEventId);
      if (!block) return 1;
      // Index 0 is the held Shift; the arrow chips behind it count presses.
      const remaining = pressesRemaining(block, task.target);
      return Math.min(
        Math.max(task.keycaps.length - remaining, 1),
        task.keycaps.length - 1,
      );
    }
    case "resize": {
      const tabCount = task.keycaps.indexOf("Shift");
      const tabsDone =
        practice.focusedId === task.targetEventId
          ? ([null, "start", "end"] as const).indexOf(practice.edge)
          : 0;
      if (practice.edge !== task.edge) {
        // Overshooting to the far edge wraps to chip 0: Tab again.
        return Math.min(tabsDone, tabCount - 1);
      }
      const block = blockById(practice, task.targetEventId);
      const shiftIndex = tabCount;
      if (!block) return shiftIndex + 1;
      const remaining =
        Math.abs(
          (task.edge === "start" ? block.startMin : block.endMin) -
            (task.edge === "start" ? task.target.startMin : task.target.endMin),
        ) / PRACTICE_NUDGE_MIN;
      return Math.min(
        Math.max(task.keycaps.length - remaining, shiftIndex + 1),
        task.keycaps.length - 1,
      );
    }
    case "eventJump":
      return state.jumpChipsShown ? task.keycaps.length : 0;
    case "pageJump":
      return state.simOverlay === "pagejump" ? 1 : 0;
    default:
      return 0;
  }
};
