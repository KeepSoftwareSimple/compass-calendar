import { useEffect } from "react";
import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";
import { physicalDigitIndex } from "@web/shortcuts/digit-pick.util";
import {
  isBareLetterKey,
  keyboardKey,
} from "@web/shortcuts/is-bare-letter-key";
import { FAQ_ITEMS } from "./faq";

export const WELCOME_JUMP_ATTR = "data-welcome-jump";
export const WELCOME_LETTER_ATTR = "data-welcome-letter";

/**
 * Press a number (with or without Mod) to toggle that FAQ or open a footer
 * link. Bare digits work because browsers steal Cmd/Ctrl+1–8 for tab switching.
 *
 * 1–5 toggle FAQ items when `toggleFaqAt` is given (omit it on a screen with
 * no FAQ). 6–0 activate matching `[data-welcome-jump]` links, and no-op when
 * none is mounted. Bare letters activate matching `[data-welcome-letter]`
 * links (Pricing / P).
 */
export function useWelcomeJumpShortcuts(toggleFaqAt?: (index: number) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event)) return;

      const index = physicalDigitIndex(event);
      if (index !== null) {
        if (index < FAQ_ITEMS.length) {
          if (!toggleFaqAt) return;
          event.preventDefault();
          toggleFaqAt(index);
          return;
        }

        const footerIndex = index - FAQ_ITEMS.length;
        const el = document.querySelector<HTMLElement>(
          `[${WELCOME_JUMP_ATTR}="${footerIndex}"]`,
        );
        if (!el) return;

        event.preventDefault();
        el.click();
        return;
      }

      const letter = keyboardKey(event).toLowerCase();
      if (!isBareLetterKey(event, letter)) return;
      const letterEl = document.querySelector<HTMLElement>(
        `[${WELCOME_LETTER_ATTR}="${letter}"]`,
      );
      if (!letterEl) return;

      event.preventDefault();
      letterEl.click();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [toggleFaqAt]);
}
