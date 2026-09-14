import type React from "react";
import { useRef, useState } from "react";
import { HOURS_AM_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import { theme } from "@web/common/styles/theme";
import { useEventPalette } from "@web/common/styles/theme.util";
import { MobileGameBoard } from "@web/components/MobileGate/MobileGameBoard";
import { MOBILE_PRIMARY_BUTTON_CLASS } from "@web/components/MobileGate/mobile-buttons";
import {
  type MobileSlot,
  slotFromPointer,
} from "@web/components/MobileGate/mobile-game.levels";
import {
  currentLevel,
  currentPiece,
  type MobileGameState,
} from "@web/components/MobileGate/mobile-game.state";
import { streakMultiplier } from "@web/components/ShortcutShowcase/game.tasks";

const TAP_MOVE_THRESHOLD_PX = 8;

const formatTime = (minutes: number) =>
  dayjs().startOf("day").add(minutes, "minute").format(HOURS_AM_FORMAT);

const formatDuration = (minutes: number) =>
  minutes === 60 ? "1 hour" : `${minutes} min`;

const distance = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);

/**
 * The playing and level-clear phases: score HUD, the board, and the tray
 * card the player drags or taps-to-place. All game logic lives in the pure
 * reducer; this component only translates pointer events into hover/drop
 * dispatches.
 */
export const MobileGame: React.FC<{
  state: MobileGameState;
  onHover: (slot: MobileSlot | null) => void;
  onDrop: () => void;
  onAdvanceLevel: () => void;
}> = ({ state, onHover, onDrop, onAdvanceLevel }) => {
  const level = currentLevel(state);
  const piece = currentPiece(state);
  const boardRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    rect: DOMRect;
    originX: number;
    originY: number;
    didMove: boolean;
  } | null>(null);
  const [armed, setArmed] = useState(false);
  const [instructionPulse, setInstructionPulse] = useState(0);
  const { base: pieceBase } = useEventPalette(piece?.color);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const boardEl = boardRef.current;
    if (!piece || !boardEl || dragRef.current) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers (tests) have no active pointer to capture; the
      // drag still works for events dispatched on the card itself.
    }
    // The board doesn't scroll or resize mid-drag, so one rect read is
    // enough; an orientation change lands as pointercancel.
    dragRef.current = {
      pointerId: event.pointerId,
      rect: boardEl.getBoundingClientRect(),
      originX: event.clientX,
      originY: event.clientY,
      didMove: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!piece || !drag || event.pointerId !== drag.pointerId) return;
    if (
      !drag.didMove &&
      distance(event.clientX, event.clientY, drag.originX, drag.originY) <
        TAP_MOVE_THRESHOLD_PX
    ) {
      return;
    }
    drag.didMove = true;
    onHover(
      slotFromPointer(
        drag.rect,
        event.clientX,
        event.clientY,
        level,
        piece.durationMin,
      ),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (drag.didMove) {
      setArmed(false);
      onDrop();
      return;
    }
    setArmed((isArmed) => !isArmed);
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    onHover(null);
  };

  const handleBoardPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current) return;
    if (!armed || !piece) {
      setInstructionPulse((seq) => seq + 1);
      return;
    }
    const boardEl = boardRef.current;
    if (!boardEl) return;
    onHover(
      slotFromPointer(
        boardEl.getBoundingClientRect(),
        event.clientX,
        event.clientY,
        level,
        piece.durationMin,
      ),
    );
    onDrop();
    setArmed(false);
  };

  const missedCurrentPiece =
    piece !== null && state.lastMiss?.pieceId === piece.id;
  const multiplier = streakMultiplier(state.streak);
  const instruction = missedCurrentPiece
    ? "Not quite. Check the time and try again."
    : armed
      ? "Now tap where it goes on the calendar"
      : "Drag the event onto the calendar, or tap it first";

  return (
    <div className="flex h-dvh flex-col gap-2 p-4">
      {/* HUD */}
      <div className="flex items-baseline justify-between">
        <div className="font-medium text-sm text-text">
          Level {state.levelIndex + 1} of 3
          <span className="ml-2 text-text-muted text-xs">{level.title}</span>
        </div>
        <div className="relative flex items-baseline gap-2">
          {multiplier > 1 && (
            <span className="rounded bg-accent px-1.5 py-0.5 font-medium text-on-accent text-xs">
              x{multiplier}
            </span>
          )}
          <span className="font-medium text-lg text-text" data-game-score>
            {state.score.toLocaleString()}
          </span>
          {state.lastAward && (
            <span
              key={state.lastAward.seq}
              aria-hidden
              className="c-game-score-pop pointer-events-none absolute -top-1 right-0 font-medium text-accent text-sm"
            >
              +{state.lastAward.points}
            </span>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="min-h-0 flex-1 rounded border border-border bg-surface p-2">
        <MobileGameBoard
          level={level}
          board={state.board}
          piece={piece}
          hoverSlot={state.hoverSlot}
          lastAward={state.lastAward}
          boardRef={boardRef}
          onBoardPointerUp={handleBoardPointerUp}
        />
      </div>

      {/* Tray or level-clear interstitial */}
      {state.phase === "levelClear" ? (
        <div
          className="flex flex-col items-center gap-2 rounded border border-border bg-surface p-4 text-center"
          data-game-level-clear=""
        >
          <div className="font-medium text-l text-text">
            Level {state.levelIndex + 1} clear!
          </div>
          <div className="text-sm text-text-muted">
            {state.score.toLocaleString()} points so far
          </div>
          <button
            type="button"
            onClick={onAdvanceLevel}
            className={MOBILE_PRIMARY_BUTTON_CLASS}
          >
            Next level
          </button>
        </div>
      ) : (
        piece && (
          <div className="flex flex-col gap-1">
            {/* A button so the drag handle is a real interactive element;
                the long-press context menu is suppressed because the touch
                sequence targets this card even while the finger is over the
                board. */}
            <button
              type="button"
              key={
                missedCurrentPiece ? `miss-${state.lastMiss?.seq}` : piece.id
              }
              aria-pressed={armed}
              className={`w-full cursor-grab touch-none select-none rounded-md border-2 px-3 py-3 text-center focus:outline focus:outline-2 focus:outline-accent focus:outline-offset-2 ${
                armed
                  ? "border-accent outline outline-2 outline-accent outline-offset-2"
                  : "border-transparent"
              } ${missedCurrentPiece ? "c-game-shake" : ""}`}
              data-game-piece={piece.id}
              style={{
                backgroundColor: pieceBase,
                color: theme.getContrastText(pieceBase),
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className="block font-medium text-base">{piece.title}</span>
              <span className="block text-sm opacity-90">
                {level.dayCount > 1
                  ? `${level.dayLabels[piece.target.dayIndex]} `
                  : ""}
                {formatTime(piece.target.startMin)}
                {" for "}
                {formatDuration(piece.durationMin)}
              </span>
            </button>
            <p
              key={instructionPulse}
              className={`min-h-5 text-center text-text-muted text-xs ${
                instructionPulse > 0 ? "c-game-shake" : ""
              }`}
            >
              {instruction}
            </p>
          </div>
        )
      )}
    </div>
  );
};
