import { ensureDesktopExportEnv } from "@core/desktop/desktop-export-env";
import {
  createInitialGameState,
  type GameKey,
  type GameState,
  handleGameKey,
  skipCurrentTask,
  startRun,
} from "@web/components/ShortcutShowcase/game.state";
import {
  GAME_SEED_EVENTS,
  RUN_TASKS,
} from "@web/components/ShortcutShowcase/game.tasks";

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

/** The keyboard script that clears the whole queue (mirrors game.state.test.ts). */
const WINNING_SCRIPT: GameKey[] = [
  key.create,
  key.arrow("left"),
  key.enter,
  key.digit("9"),
  key.digit("3"),
  key.digit("0"),
  key.enter,
  key.arrow("down", true),
  key.tab,
  key.arrow("up", true),
  key.del,
  key.undo,
  key.legend,
  key.closeOverlay,
  key.jump,
  key.letter("s"),
  key.modHoldReveal,
  key.pageJumpDigit("1"),
  key.palette,
  key.closeOverlay,
  key.create,
  key.arrow("down"),
  key.enter,
];

const serializeKey = (gameKey: GameKey): string => {
  switch (gameKey.type) {
    case "create":
      return "create";
    case "enter":
      return "enter";
    case "delete":
      return "delete";
    case "undo":
      return "undo";
    case "legend":
      return "legend";
    case "palette":
      return "palette";
    case "jump":
      return "jump";
    case "modHoldReveal":
      return "modHoldReveal";
    case "modHoldEnd":
      return "modHoldEnd";
    case "closeOverlay":
      return "closeOverlay";
    case "tab":
      return gameKey.backward ? "tab:backward" : "tab";
    case "digit":
      return `digit:${gameKey.digit}`;
    case "letter":
      return `letter:${gameKey.letter}`;
    case "pageJumpDigit":
      return `pageJumpDigit:${gameKey.digit}`;
    case "arrow":
      return `arrow:${gameKey.direction}${gameKey.shift ? ":shift" : ""}`;
  }
};

const serializeState = (state: GameState) => ({
  phase: state.phase,
  outcome: state.outcome,
  taskIndex: state.taskIndex,
  tasksDone: state.tasksDone,
  tasksSkipped: state.tasksSkipped,
  score: state.score,
  streak: state.streak,
  timeBonus: state.timeBonus,
  digitBuffer: state.digitBuffer,
  timed: state.timed,
  simOverlay: state.simOverlay,
  simOverlayOpened: state.simOverlayOpened,
  jumpChipsShown: state.jumpChipsShown,
  buzzer: state.buzzer,
  practice: {
    focusedId: state.practice.focusedId,
    placingId: state.practice.placingId,
    edge: state.practice.edge,
    lastDeletedId: state.practice.lastDeleted?.id ?? null,
    events: state.practice.events.map((event) => ({
      id: event.id,
      title: event.title,
      dayIndex: event.dayIndex,
      startMin: event.startMin,
      endMin: event.endMin,
      color: event.color ?? null,
    })),
  },
});

const playKeys = (
  state: GameState,
  keys: GameKey[],
  nowMs: number,
): GameState =>
  keys.reduce(
    (current, gameKey) => handleGameKey(current, gameKey, nowMs),
    state,
  );

/** The prefix of the winning script that lands the task at `taskIndex`. */
const playThroughTask = (
  taskIndex: number,
): { keys: GameKey[]; state: GameState } => {
  let state = startRun(createInitialGameState(), T0);
  const keys: GameKey[] = [];
  for (const gameKey of WINNING_SCRIPT) {
    if (state.taskIndex > taskIndex) break;
    keys.push(gameKey);
    state = handleGameKey(state, gameKey, T0);
  }
  return { keys, state };
};

export const buildBlockPartyFixtures = () => {
  ensureDesktopExportEnv();

  const perTaskCases = RUN_TASKS.map((task, index) => {
    const { keys, state } = playThroughTask(index);
    return {
      id: `complete-${task.id}`,
      taskId: task.id,
      keys: keys.map(serializeKey),
      nowMs: T0,
      output: serializeState(state),
    };
  });

  let winning = startRun(createInitialGameState(), T0);
  winning = playKeys(winning, WINNING_SCRIPT, T0 + 1_000);

  const skipCase = (() => {
    let state = startRun(createInitialGameState(), T0);
    state = skipCurrentTask(state, T0);
    return {
      id: "skip-first-task",
      keys: [] as string[],
      nowMs: T0,
      output: serializeState(state),
    };
  })();

  return {
    seedEvents: GAME_SEED_EVENTS,
    runTasks: RUN_TASKS,
    cases: [
      ...perTaskCases,
      {
        id: "winning-script",
        keys: WINNING_SCRIPT.map(serializeKey),
        nowMs: T0 + 1_000,
        output: serializeState(winning),
      },
      skipCase,
    ],
  };
};

export const emitBlockPartyFixturesJson = (): string =>
  `${JSON.stringify(buildBlockPartyFixtures(), null, 2)}\n`;
