import { type EventColorSlot } from "@core/types/event-color.contracts";
import { type PracticeEventBlock } from "@web/components/ShortcutShowcase/practice.state";
import { KEYMAP } from "@web/shortcuts/keymap";

/**
 * Block Party: one run against a fixed, authored queue of scheduling tasks.
 * The first run is untimed practice; replays can race the clock.
 * Deterministic on purpose: ramped difficulty, and every run is scriptable
 * in tests. Keycaps derive from KEYMAP so a remap propagates to the cards.
 */

/** The clock for a timed run. Expiry snapshots the score; it never ends the run. */
export const RUN_DURATION_MS = 120_000;
export const TASK_BASE_POINTS = 100;
/** Clear a task this fast to earn the speed bonus and grow the streak. */
export const SPEED_BONUS_MS = 8_000;
export const SPEED_BONUS_POINTS = 50;
/** Consecutive speed clears multiply the award: x2 at 3, x3 at 6. */
const STREAK_X2_AT = 3;
const STREAK_X3_AT = 6;

export const streakMultiplier = (streak: number): 1 | 2 | 3 =>
  streak >= STREAK_X3_AT ? 3 : streak >= STREAK_X2_AT ? 2 : 1;

/** Shared by Block Party and Time Block Party so the two games stay in sync. */
export const scorePlacement = (priorStreak: number, elapsedMs: number) => {
  const speedy = elapsedMs <= SPEED_BONUS_MS;
  const streak = speedy ? priorStreak + 1 : 0;
  const points =
    (TASK_BASE_POINTS + (speedy ? SPEED_BONUS_POINTS : 0)) *
    streakMultiplier(streak);
  return { speedy, streak, points };
};

/** Clearing the whole queue converts remaining seconds into points. */
export const TIME_BONUS_PER_SECOND = 10;

export type GameSlot = { dayIndex: number; startMin: number; endMin: number };
export type GamePiece = { id: string; title: string; color?: EventColorSlot };
export type GameTaskType =
  | "place"
  | "quickTime"
  | "nudge"
  | "resize"
  | "delete"
  | "undo"
  | "legend"
  | "eventJump"
  | "pageJump"
  | "palette";

type GameTaskBase = {
  id: string;
  /** Card headline: the piece or the change being asked for. */
  title: string;
  /** One-line instruction under the headline. */
  instruction: string;
  /** Keycap chips for the move this task teaches, one chip per press. */
  keycaps: readonly string[];
  /** Shown on the card when the player stalls; more explicit than `instruction`. */
  hint: string;
};

/** Second idle beat: after the hint, offer the exit. */
export const STUCK_SKIP_HINT =
  "Still stuck? Esc skips this task and the run keeps going.";

export type GameTask =
  | (GameTaskBase & {
      type: "place";
      piece: GamePiece;
      /** Where C drops the piece; arrows walk it to the target. */
      spawn: GameSlot;
      target: GameSlot;
    })
  | (GameTaskBase & {
      type: "quickTime";
      piece: GamePiece;
      /** Typed digits spawn on the target day; duration comes from the slot. */
      target: GameSlot;
    })
  | (GameTaskBase & {
      type: "nudge";
      targetEventId: string;
      target: GameSlot;
    })
  | (GameTaskBase & {
      type: "resize";
      targetEventId: string;
      target: GameSlot;
      /** Which edge Tab must land on before Shift+Arrow resizes it. */
      edge: "start" | "end";
    })
  | (GameTaskBase & { type: "delete"; targetEventId: string })
  | (GameTaskBase & {
      type: "undo";
      targetEventId: string;
      /** Where the restored block lands, so the ghost can show it. */
      target: GameSlot;
    })
  // Discovery beats: open a simulated overlay (legend / page-jump numbers /
  // command palette) or jump to a block by its letter chip. No board change.
  | (GameTaskBase & { type: "legend" | "pageJump" | "palette" })
  | (GameTaskBase & { type: "eventJump"; targetEventId: string });

const t = (hour: number, minute = 0) => hour * 60 + minute;

/** The board a run starts with: targets for the nudge/resize/delete beats. */
export const GAME_SEED_EVENTS: readonly PracticeEventBlock[] = [
  {
    id: "game-kickoff",
    title: "Team kickoff",
    dayIndex: 0,
    startMin: t(11),
    endMin: t(12),
    color: "blue",
  },
  {
    id: "game-one-on-one",
    title: "1:1 with Alex",
    dayIndex: 1,
    startMin: t(10),
    endMin: t(10, 30),
    color: "plum",
  },
  {
    id: "game-gym",
    title: "Gym",
    dayIndex: 2,
    startMin: t(12),
    endMin: t(13),
    color: "green",
  },
];

export const RUN_TASKS: readonly GameTask[] = [
  {
    id: "place-standup",
    type: "place",
    title: "Standup",
    instruction: "Get it into the outline on Monday, then lock it in.",
    hint: "Press C and a Standup piece drops onto the board. Tap Left to reach Monday, then Enter locks it.",
    keycaps: [...KEYMAP.createEvent.keycaps, "ArrowLeft", "Enter"],
    piece: { id: "piece-standup", title: "Standup", color: "gold" },
    spawn: { dayIndex: 1, startMin: t(9), endMin: t(9, 30) },
    target: { dayIndex: 0, startMin: t(9), endMin: t(9, 30) },
  },
  {
    id: "quicktime-coffee",
    type: "quickTime",
    title: "Coffee",
    instruction: "Type 930 for 9:30, then lock it in.",
    hint: "Type 9 3 0 and Coffee appears at 9:30. Enter locks it.",
    keycaps: ["9", "3", "0", "Enter"],
    piece: { id: "piece-coffee", title: "Coffee", color: "mint" },
    target: { dayIndex: 2, startMin: t(9, 30), endMin: t(10) },
  },
  {
    id: "nudge-standup",
    type: "nudge",
    title: "Standup moved",
    instruction: "Hold Shift and tap Down to reach 9:15.",
    hint: "Hold Shift and tap Down once. Each tap moves it 15 minutes.",
    keycaps: ["Shift", "ArrowDown"],
    targetEventId: "piece-standup",
    target: { dayIndex: 0, startMin: t(9, 15), endMin: t(9, 45) },
  },
  {
    id: "resize-one-on-one",
    type: "resize",
    title: "1:1 running long",
    instruction:
      "Press Tab to light the top edge, then hold Shift and tap Up to start at 9:45.",
    hint: "Tab cycles what your arrows grab: whole block, top edge, bottom edge. Tab once for the top edge, then Shift Up.",
    keycaps: [KEYMAP.edgeFocus.hotkey, "Shift", "ArrowUp"],
    targetEventId: "game-one-on-one",
    target: { dayIndex: 1, startMin: t(9, 45), endMin: t(10, 30) },
    edge: "start",
  },
  {
    id: "delete-gym",
    type: "delete",
    title: "Gym got cancelled",
    instruction: "Clear it off the board.",
    hint: "The Gym block is already selected. One press of Delete clears it.",
    keycaps: ["Delete"],
    targetEventId: "game-gym",
  },
  {
    id: "undo-gym",
    type: "undo",
    title: "Wait, it's back on",
    instruction: "Undo brings it right back.",
    hint: "Hold Cmd or Ctrl and press Z. The block comes right back.",
    keycaps: KEYMAP.undo.keycaps,
    targetEventId: "game-gym",
    target: { dayIndex: 2, startMin: t(12), endMin: t(13) },
  },
  {
    id: "legend-peek",
    type: "legend",
    title: "Blanking on a move?",
    instruction:
      "The legend lists every shortcut. Open it, then close it with Esc.",
    hint: "The ? key is Shift and /. Open the legend, take a peek, then Esc closes it.",
    keycaps: ["?"],
  },
  {
    id: "jump-to-kickoff",
    type: "eventJump",
    title: "Fly across the board",
    instruction:
      "Press H to reveal jump letters, then type the one on Team kickoff.",
    hint: "Press H and letters appear on every block. Type the letter sitting on Team kickoff.",
    keycaps: KEYMAP.eventJump.keycaps,
    targetEventId: "game-kickoff",
  },
  {
    id: "page-jump-peek",
    type: "pageJump",
    title: "Numbers jump anywhere",
    instruction:
      "Hold Cmd or Ctrl until the jump numbers appear, then press 1.",
    hint: "Hold Cmd or Ctrl alone and wait a beat. When the numbers appear, press 1 while still holding.",
    keycaps: ["Mod", "1"],
  },
  {
    id: "palette-peek",
    type: "palette",
    title: "One palette, every command",
    instruction: "Open the command palette, then close it with Esc.",
    hint: "Hold Cmd or Ctrl and press K to open it, then Esc to close it.",
    keycaps: KEYMAP.commandPalette.keycaps,
  },
  {
    id: "place-party",
    type: "place",
    title: "Ship-it party",
    instruction: "Wednesday at 5. Bring it home.",
    hint: "Press C to drop it, tap Down once to reach 5:00, then Enter. Last one.",
    keycaps: [...KEYMAP.createEvent.keycaps, "ArrowDown", "Enter"],
    piece: { id: "piece-party", title: "Ship-it party", color: "coral" },
    spawn: { dayIndex: 2, startMin: t(16, 45), endMin: t(17, 45) },
    target: { dayIndex: 2, startMin: t(17), endMin: t(18) },
  },
];

/** Dashed outline shown on the grid for the current task, if it has one. */
export const getTaskGhost = (task: GameTask): GameSlot | null =>
  "target" in task ? task.target : null;

/** The block a completed task touched, so the lock-in flash can find it. */
export const getTaskBlockId = (taskId: string): string | null => {
  const task = RUN_TASKS.find((candidate) => candidate.id === taskId);
  if (!task || task.type === "delete") return null;
  if ("piece" in task) return task.piece.id;
  return "targetEventId" in task ? task.targetEventId : null;
};

export type LearnedMove = { label: string; keys: readonly string[] };

const MOVE_LABELS: Record<GameTaskType, LearnedMove> = {
  place: {
    label: "Create and place",
    keys: [
      ...KEYMAP.createEvent.keycaps,
      "ArrowRight",
      ...KEYMAP.saveDraft.keycaps,
    ],
  },
  quickTime: {
    label: "Type a time to schedule it",
    keys: ["1", "2", "3", "0"],
  },
  nudge: { label: "Move an event", keys: KEYMAP.moveEvent.keycaps },
  resize: {
    label: "Resize one edge",
    keys: [KEYMAP.edgeFocus.hotkey, ...KEYMAP.moveEvent.timedEdgeKeycaps],
  },
  delete: { label: "Delete", keys: ["Delete"] },
  undo: { label: "Undo", keys: KEYMAP.undo.keycaps },
  legend: { label: "Shortcut legend", keys: ["?"] },
  eventJump: { label: "Jump to an event", keys: KEYMAP.eventJump.keycaps },
  pageJump: { label: "Jump anywhere", keys: KEYMAP.jumpPageTarget.keycaps },
  palette: { label: "Command palette", keys: KEYMAP.commandPalette.keycaps },
};

/** The distinct moves the player actually used, in the order they met them. */
export const getLearnedMoves = (tasksDone: number): LearnedMove[] => {
  const seen = new Set<GameTaskType>();
  const moves: LearnedMove[] = [];
  for (const task of RUN_TASKS.slice(0, tasksDone)) {
    if (seen.has(task.type)) continue;
    seen.add(task.type);
    moves.push(MOVE_LABELS[task.type]);
  }
  return moves;
};
