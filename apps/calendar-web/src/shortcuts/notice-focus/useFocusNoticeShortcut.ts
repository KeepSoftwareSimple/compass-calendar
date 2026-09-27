import {
  findNextNoticeTarget,
  getVisibleNotices,
} from "@web/shortcuts/notice-focus/notice-focus";
import { useBareLetterShortcut } from "@web/shortcuts/useBareLetterShortcut";

export const FOCUS_NOTICE_LETTER = "f";

/**
 * Bare `f` focuses the latest notice - an action toast or banner marked with
 * `data-notice` - so its buttons are reachable without a long Tab walk.
 * Repeat presses cycle through visible notices; Tab moves within one, Enter
 * activates, Escape dismisses toasts (useEscapeToDismissToast).
 *
 * Stands down with the other bare letters: app-locked, typing, an `e`…
 * sequence armed, or event jump chips owning letters (`f` is a jump key for
 * Friday).
 */
export function useFocusNoticeShortcut() {
  useBareLetterShortcut(
    FOCUS_NOTICE_LETTER,
    () => {
      const target = findNextNoticeTarget(
        getVisibleNotices(),
        document.activeElement,
      );
      if (!target) return false;
      target.focus();
      return true;
    },
    "focus-notice",
  );
}
