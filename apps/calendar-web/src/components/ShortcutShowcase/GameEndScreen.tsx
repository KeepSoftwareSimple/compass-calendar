import { type FC } from "react";
import { type GameState } from "@web/components/ShortcutShowcase/game.state";
import {
  getLearnedMoves,
  RUN_TASKS,
  TIME_BONUS_PER_SECOND,
} from "@web/components/ShortcutShowcase/game.tasks";
import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "@web/components/ShortcutShowcase/showcase-buttons";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

/**
 * The run's scoreboard. Every run finishes the queue now (the buzzer only
 * freezes the timed score), so the screen celebrates and offers a timed
 * rematch. For anonymous players the loudest button is signup: the moment
 * right after the game lands is the highest-intent moment onboarding gets.
 */
export const GameEndScreen: FC<{
  outcome: GameState["outcome"];
  score: number;
  tasksDone: number;
  tasksSkipped: number;
  timeBonus: number;
  timed: boolean;
  buzzer: GameState["buzzer"];
  authenticated: boolean;
  closing: boolean;
  onSignUp: () => void;
  onGraduate: () => void;
  onReplay: () => void;
}> = ({
  outcome,
  score,
  tasksDone,
  tasksSkipped,
  timeBonus,
  timed,
  buzzer,
  authenticated,
  closing,
  onSignUp,
  onGraduate,
  onReplay,
}) => {
  const learnedMoves = getLearnedMoves(tasksDone);
  const heading = !timed
    ? "You cleared the week!"
    : buzzer
      ? "Cleared it. The clock just blinked first."
      : "You beat the clock!";

  return (
    <div
      className="flex w-full max-w-lg flex-col gap-5 rounded-xl border border-border bg-surface p-8 shadow-xl"
      data-game-end-screen={outcome ?? "cleared"}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-text text-xl">{heading}</h2>
        <p className="text-sm text-text-muted">
          {tasksSkipped > 0
            ? "The moves you made work the same on your real calendar. The rest will come."
            : "Every one of those moves works the same on your real calendar."}
        </p>
      </div>

      <div className="flex items-end justify-between rounded-lg bg-surface-overlay px-4 py-3">
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide">
            Score
          </p>
          <p className="font-semibold text-3xl text-text tabular-nums">
            {score}
          </p>
        </div>
        <div className="text-right text-text-muted text-xs">
          <p>
            {tasksDone}/{RUN_TASKS.length} tasks cleared
          </p>
          {tasksSkipped > 0 && <p>{tasksSkipped} skipped</p>}
          {timeBonus > 0 && (
            <p>
              +{timeBonus} time bonus ({timeBonus / TIME_BONUS_PER_SECOND}s
              left)
            </p>
          )}
          {buzzer && (
            <p>
              At the buzzer: {buzzer.score} ({buzzer.tasksDone} tasks)
            </p>
          )}
        </div>
      </div>

      {learnedMoves.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-text-muted uppercase tracking-wide">
            Moves you learned
          </p>
          {learnedMoves.map((move) => (
            <div
              key={move.label}
              className="flex items-center justify-between gap-3 text-sm text-text"
            >
              <span>{move.label}</span>
              <ShortcutKeys keys={[...move.keys]} />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!authenticated && (
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            disabled={closing}
            onClick={onSignUp}
          >
            Sign up to keep your calendar
            <ShortcutHint className="shrink-0">Enter</ShortcutHint>
          </button>
        )}
        <button
          type="button"
          className={
            authenticated ? PRIMARY_BUTTON_CLASS : SECONDARY_BUTTON_CLASS
          }
          disabled={closing}
          onClick={onGraduate}
        >
          Open your calendar
          <ShortcutHint className="shrink-0">
            {authenticated ? "Enter" : "O"}
          </ShortcutHint>
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS}
          disabled={closing}
          onClick={onReplay}
        >
          {timed ? "Play again" : "Race the clock"}
          <ShortcutHint className="shrink-0">P</ShortcutHint>
        </button>
      </div>
    </div>
  );
};
