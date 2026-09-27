import { type FC } from "react";
import { type GameAward } from "@web/components/ShortcutShowcase/game.state";
import {
  type GameTask,
  RUN_TASKS,
  STUCK_SKIP_HINT,
  streakMultiplier,
} from "@web/components/ShortcutShowcase/game.tasks";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { ShortCutLabel } from "@web/components/Shortcuts/ShortcutLabel";

const formatClock = (remainingSeconds: number) => {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const TIMER_WARNING_SECONDS = 15;

/** Countdown (timed runs only), score, and streak strip above the grid. */
export const GameHud: FC<{
  remainingSeconds: number;
  score: number;
  streak: number;
  award: GameAward | null;
  timed: boolean;
  /** A timed run whose clock already hit zero: pin 0:00 and keep playing. */
  overtime: boolean;
}> = ({ remainingSeconds, score, streak, award, timed, overtime }) => {
  const warning =
    timed && !overtime && remainingSeconds <= TIMER_WARNING_SECONDS;
  const multiplier = streakMultiplier(streak);

  return (
    <div className="flex items-center justify-between pb-3">
      {timed ? (
        <span className="flex items-baseline gap-2">
          <span
            aria-label="Time left"
            aria-live="off"
            className={`font-semibold text-lg tabular-nums ${
              overtime
                ? "text-error"
                : warning
                  ? "animate-pulse text-error motion-reduce:animate-none"
                  : "text-text"
            }`}
            role="timer"
          >
            {formatClock(overtime ? 0 : remainingSeconds)}
          </span>
          {overtime && (
            <span className="font-medium text-error text-xs">overtime</span>
          )}
        </span>
      ) : (
        <span className="font-medium text-text-muted text-xs uppercase tracking-wide">
          Practice
        </span>
      )}
      <div className="relative flex items-center gap-2">
        {multiplier > 1 && (
          <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-background text-xs">
            x{multiplier} streak
          </span>
        )}
        <span
          className="font-semibold text-lg text-text tabular-nums"
          data-game-score=""
        >
          {score}
        </span>
        {award && (
          <span
            key={award.seq}
            aria-hidden
            className="c-game-score-pop absolute -top-4 right-0 font-semibold text-accent text-sm"
          >
            +{award.points}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * The piece queue: the current task as a big card with its keycaps, and the
 * next two peeking underneath (the "next piece" preview). `keycaps` comes in
 * as a prop (getDisplayKeycaps) because a card's chips can change mid-task.
 * Chips ahead of `nextKeycapIndex` are still to come, the chip at it pulses
 * as the exact next key, and chips behind it dim as done.
 */
export const GameTaskQueue: FC<{
  taskIndex: number;
  keycaps: readonly string[];
  nextKeycapIndex: number;
  /** 0 none, 1 the task's hint, 2 hint plus the Esc escape hatch. */
  hintStage: 0 | 1 | 2;
}> = ({ taskIndex, keycaps, nextKeycapIndex, hintStage }) => {
  const task: GameTask | undefined = RUN_TASKS[taskIndex];
  if (!task) return null;
  const upNext = RUN_TASKS.slice(taskIndex + 1, taskIndex + 3);
  // Mod leads a chord (undo, palette): its partner pulses with it. The
  // page-jump task is the exception: Mod is held alone first.
  const nextKey = keycaps[nextKeycapIndex];
  const chordPartnerIndex =
    task.type !== "pageJump" && nextKey === "Mod" ? nextKeycapIndex + 1 : -1;
  // Shift stays held through the arrow run: it pulses with the arrows behind
  // it instead of dimming as done.
  const shiftIndex = keycaps.indexOf("Shift");
  const shiftHeld = shiftIndex !== -1 && nextKeycapIndex > shiftIndex;

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium text-accent text-xs uppercase tracking-wide">
        Task {taskIndex + 1}/{RUN_TASKS.length}
      </p>
      <div
        className="rounded-xl border border-border bg-surface p-4 shadow-md"
        data-game-task={task.id}
      >
        <h3 className="font-semibold text-lg text-text">{task.title}</h3>
        <p className="pt-1 text-sm text-text-muted">{task.instruction}</p>
        {hintStage > 0 && (
          <p className="c-game-hint-in pt-2 text-accent text-sm" role="status">
            {task.hint}
          </p>
        )}
        {hintStage > 1 && (
          <p
            className="c-game-hint-in pt-1 text-text-muted text-xs"
            role="status"
          >
            {STUCK_SKIP_HINT}
          </p>
        )}
        <div className="flex items-center gap-1 pt-3">
          {keycaps.map((key, index) => (
            <ShortcutHint
              // biome-ignore lint/suspicious/noArrayIndexKey: keycap sequences repeat keys; position is the identity
              key={`${key}-${index}`}
              variant="keycap"
              className={
                index === nextKeycapIndex ||
                index === chordPartnerIndex ||
                (shiftHeld && index === shiftIndex)
                  ? "c-keycap-next"
                  : index < nextKeycapIndex
                    ? "opacity-40"
                    : ""
              }
            >
              <ShortCutLabel k={key} />
            </ShortcutHint>
          ))}
        </div>
      </div>
      {upNext.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-text-muted uppercase tracking-wide">
            Up next
          </p>
          {upNext.map((next) => (
            <div
              key={next.id}
              className="truncate rounded-md border border-border bg-surface-overlay px-3 py-1.5 text-text-muted text-xs"
            >
              {next.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
