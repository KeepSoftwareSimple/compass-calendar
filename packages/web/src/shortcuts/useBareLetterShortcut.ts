import { useEffect, useRef } from "react";
import { shouldStandDownBareLetterShortcut } from "@web/shortcuts/bare-letter-stand-down";
import { isBareLetterKey } from "@web/shortcuts/is-bare-letter-key";

/**
 * The wiring every bare-letter shortcut (`f`, `m`, `x`) needs: a capture-phase
 * keydown listener, the shared stand-down, and claiming the key only once the
 * handler acted. Written once so a new letter cannot quietly skip one of the
 * yields, and so a fix to the contract reaches all of them.
 *
 * Capture phase on `document` rather than `useAppShortcut`: these letters have
 * to run before the grid's own key handling, and they stand down on app-lock
 * themselves instead of registering through the hotkeys runtime.
 *
 * `handler` returns whether it acted. `false` (no focused event card, no
 * visible notice) lets the key through untouched, so a letter that means
 * nothing here still reaches whatever else wants it.
 */
export function useBareLetterShortcut(
  letter: string,
  handler: (event: KeyboardEvent) => boolean,
): void {
  // Held in a ref so a handler that closes over changing state (a mutation
  // callback, say) does not resubscribe the listener on every render.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!isBareLetterKey(event, letter)) return;
      if (shouldStandDownBareLetterShortcut(event)) return;
      if (!handlerRef.current(event)) return;

      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [letter]);
}
