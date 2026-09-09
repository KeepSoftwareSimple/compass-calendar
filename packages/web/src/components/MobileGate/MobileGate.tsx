import type React from "react";
import { useEffect, useRef, useState } from "react";
import { track } from "@web/auth/posthog/track";
import { DesktopHandoff } from "@web/components/MobileGate/DesktopHandoff";
import { MobileGame } from "@web/components/MobileGate/MobileGame";
import {
  MOBILE_PRIMARY_BUTTON_CLASS,
  MOBILE_TEXT_BUTTON_CLASS,
  MOBILE_TEXT_BUTTON_COMPACT_CLASS,
} from "@web/components/MobileGate/mobile-buttons";
import {
  advanceLevel,
  createInitialMobileGameState,
  dropPiece,
  type MobileGameState,
  setHoverSlot,
  skipToEnd,
  startGame,
} from "@web/components/MobileGate/mobile-game.state";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { pointerPassAttributes } from "@web/shortcuts/keyboard-only/pointer-action";

/**
 * The mobile landing experience: instead of a cold "use a desktop" wall,
 * visitors get Time Block Party, a short drag-the-event-into-place game, and
 * the desktop handoff (copy link + waitlist) arrives with their score at the
 * end. The intro leads with what Compass actually is (a keyboard-first
 * desktop calendar) before pitching the game, so first-time phone visitors
 * don't mistake the game for the product. The intro's skip link goes
 * straight to the handoff.
 */
export const MobileGate: React.FC<{
  /** Test seam: start from a mid-game or finished state. */
  initialState?: MobileGameState;
}> = ({ initialState }) => {
  const [game, setGame] = useState<MobileGameState>(
    () => initialState ?? createInitialMobileGameState(),
  );
  useAppLockReason("mobileGate", true);

  // Analytics keyed on phase transitions so each fires exactly once per run.
  const prevPhaseRef = useRef(game.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev === game.phase) return;
    prevPhaseRef.current = game.phase;
    if (game.phase === "playing" && prev !== "levelClear") {
      track(
        "mobile_game_started",
        prev === "ended" ? { replay: true } : undefined,
      );
    } else if (game.phase === "levelClear") {
      track("mobile_game_level_completed", {
        level: game.levelIndex + 1,
        score: game.score,
        misses: game.misses,
      });
    } else if (game.phase === "ended") {
      if (game.skipped) {
        track("mobile_game_skipped");
      } else {
        track("mobile_game_finished", {
          score: game.score,
          misses: game.misses,
        });
      }
    }
  }, [game]);

  const handleReplay = () => {
    setGame(startGame(createInitialMobileGameState(), Date.now()));
  };

  return (
    <div className="min-h-dvh bg-background" {...pointerPassAttributes}>
      {game.phase === "intro" && (
        <div className="flex min-h-dvh items-center justify-center p-4">
          <div className="flex w-[400px] max-w-[90vw] flex-col items-center rounded border border-border bg-surface p-8 text-center">
            <h1 className="mb-3 font-medium font-sans text-2xl text-text">
              Compass is a keyboard-first calendar
            </h1>
            <p className="mb-6 font-sans text-base text-text-muted leading-relaxed">
              It&apos;s built for the desktop, so it doesn&apos;t run on phones
              yet. While you&apos;re here, we made you a little game for fun.
            </p>
            <div className="mb-6 w-full rounded border border-border bg-surface-overlay px-4 py-3">
              <h2 className="font-medium font-sans text-lg text-text">
                Time Block Party
              </h2>
              <p className="mt-1 font-sans text-sm text-text-muted leading-relaxed">
                Compass turns your week into blocks of time. Drag each event to
                its spot on the calendar and rack up points.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGame((state) => startGame(state, Date.now()))}
              className={`mb-3 ${MOBILE_PRIMARY_BUTTON_CLASS}`}
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => setGame(skipToEnd)}
              className={MOBILE_TEXT_BUTTON_CLASS}
            >
              Skip to desktop link
            </button>
          </div>
        </div>
      )}

      {(game.phase === "playing" || game.phase === "levelClear") && (
        <MobileGame
          state={game}
          onHover={(slot) => setGame((state) => setHoverSlot(state, slot))}
          onDrop={() => setGame((state) => dropPiece(state, Date.now()))}
          onAdvanceLevel={() =>
            setGame((state) => advanceLevel(state, Date.now()))
          }
        />
      )}

      {game.phase === "ended" && (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4">
          <DesktopHandoff
            header={
              !game.skipped && (
                <div
                  className="mb-6 w-full rounded border border-border bg-surface-overlay px-4 py-3"
                  data-game-final-score={game.score}
                >
                  <div className="text-text-muted text-xs">
                    Time Block Party
                  </div>
                  <div className="font-medium text-2xl text-text">
                    {game.score.toLocaleString()} points
                  </div>
                </div>
              )
            }
          />
          <button
            type="button"
            onClick={handleReplay}
            className={MOBILE_TEXT_BUTTON_COMPACT_CLASS}
          >
            {game.skipped ? "Play Time Block Party" : "Play again"}
          </button>
        </div>
      )}
    </div>
  );
};
