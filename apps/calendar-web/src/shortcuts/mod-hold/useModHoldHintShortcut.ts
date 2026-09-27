import { resolveModifier } from "@tanstack/react-hotkeys";
import { useEffect, useRef, useState } from "react";
import { isAppLocked } from "@web/shortcuts/app-lock";
import { normalizedKeyboardKey } from "@web/shortcuts/is-bare-letter-key";
import { createKeyupSwallow } from "@web/shortcuts/swallow-next-keyup";

/**
 * How long Mod must be held, with nothing else pressed, before hint chips
 * appear. Matches the `e`-leader's ARM_WINDOW_MS cadence so both hold
 * gestures feel the same.
 */
export const MOD_HOLD_HINT_MS = 600;

/**
 * The hold-Mod discoverability engine: holding the platform Mod key alone for
 * MOD_HOLD_HINT_MS flips `areHintsVisible` on (an overlay renders keycap
 * chips over the jump targets), and a Mod chord dispatches through
 * `onModChord`. Each surface supplies only its own digit-to-target mapping —
 * the event form's fields (useFormDigitJumpShortcut) and the page's areas
 * (usePageJumpShortcut) share this one gesture so the muscle memory of
 * "hold Mod to see where to go next" works the same everywhere.
 *
 * `onModChord` receives every keydown while Mod (and no other modifier) is
 * held and returns whether it consumed the key; a consumed key is
 * preventDefaulted and its macOS keyup replay suppressed.
 *
 * Safari may still switch tabs for some Cmd+digit combos despite
 * preventDefault; Chromium and Firefox honor it.
 */
export function useModHoldHintShortcut({
  enabled = true,
  ignoreAppLock = false,
  holdMs = MOD_HOLD_HINT_MS,
  onModChord,
  onHintsRevealed,
  onVisibilityChange,
}: {
  enabled?: boolean;
  /**
   * Settings (and other app-lock overlays) still want hold-Mod chips. Page
   * jump and form-field jump must keep the default, which hides the gesture
   * while a dialog owns the screen.
   */
  ignoreAppLock?: boolean;
  /** 0 reveals chips on the initial Mod press instead of waiting. */
  holdMs?: number;
  onModChord: (event: KeyboardEvent) => boolean;
  /** Fires once when hold-Mod chips actually appear, not on a bare Mod tap. */
  onHintsRevealed?: () => void;
  /** Fires whenever hint visibility flips, including disable and unmount. */
  onVisibilityChange?: (visible: boolean) => void;
}): { areHintsVisible: boolean } {
  const [areHintsVisible, setAreHintsVisible] = useState(false);
  const onModChordRef = useRef(onModChord);
  onModChordRef.current = onModChord;
  const onHintsRevealedRef = useRef(onHintsRevealed);
  onHintsRevealedRef.current = onHintsRevealed;
  const onVisibilityChangeRef = useRef(onVisibilityChange);
  onVisibilityChangeRef.current = onVisibilityChange;

  useEffect(() => {
    const publishVisibility = (visible: boolean) => {
      setAreHintsVisible(visible);
      onVisibilityChangeRef.current?.(visible);
    };

    if (!enabled) {
      publishVisibility(false);
      return;
    }

    const isMac = resolveModifier("Mod") === "Meta";
    const modKey = isMac ? "Meta" : "Control";
    let holdTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let hintsVisible = false;
    const keyupSwallow = createKeyupSwallow();

    const clearHoldTimer = () => {
      if (holdTimeoutId !== null) {
        clearTimeout(holdTimeoutId);
        holdTimeoutId = null;
      }
    };

    const hideHints = () => {
      clearHoldTimer();
      if (hintsVisible) {
        hintsVisible = false;
        publishVisibility(false);
      }
    };

    const armHoldTimer = () => {
      const reveal = () => {
        holdTimeoutId = null;
        hintsVisible = true;
        publishVisibility(true);
        onHintsRevealedRef.current?.();
      };
      if (holdMs <= 0) {
        reveal();
        return;
      }
      holdTimeoutId = setTimeout(reveal, holdMs);
    };

    const isModOnly = (event: KeyboardEvent) =>
      isMac
        ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        : event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!ignoreAppLock && isAppLocked()) {
        hideHints();
        return;
      }

      if (event.key === modKey) {
        // Held modifiers auto-repeat; only the initial press should start the
        // clock, or the timer would keep resetting for as long as Mod stays down.
        if (event.repeat) return;
        if (!hintsVisible && holdTimeoutId === null) {
          armHoldTimer();
        }
        return;
      }

      if (isModOnly(event) && onModChordRef.current(event)) {
        event.preventDefault();
        event.stopPropagation();
        // macOS swallows this key's keyup while Cmd is held and replays it
        // with metaKey:false on release; suppress so nothing downstream
        // reacts to that replay as a bare keystroke.
        keyupSwallow.add(normalizedKeyboardKey(event));
        hideHints();
        return;
      }

      // Any other keydown (including an unmatched Mod chord like Mod+K) means
      // the user wasn't pausing to look; only a fresh Mod press re-arms it.
      clearHoldTimer();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (keyupSwallow.consume(event)) return;

      if (event.key === modKey) {
        hideHints();
      }
    };

    // Clicking away or losing the window abandons the gesture rather than
    // leaving chips pinned to a spot the user isn't looking at. Window
    // switches (Cmd+Tab) can swallow the Meta keyup entirely, so blur and
    // visibilitychange are covered independently of onKeyUp.
    const onPointerDown = () => hideHints();
    const onWindowBlur = () => hideHints();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") hideHints();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      hideHints();
      keyupSwallow.clear();
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, holdMs, ignoreAppLock]);

  return { areHintsVisible };
}
