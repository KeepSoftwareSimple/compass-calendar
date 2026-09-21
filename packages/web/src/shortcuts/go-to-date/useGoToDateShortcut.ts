import { settingsActions } from "@web/settings/settings.store";
import { GO_TO_DATE_LETTER } from "@web/shortcuts/go-to-date/go-to-date.constants";
import {
  CONNECTION_BANNER_SHORTCUT_KEY,
  isNoticeActionKeyActive,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { useBareLetterShortcut } from "@web/shortcuts/useBareLetterShortcut";

/**
 * Bare `G` opens the command palette so the user can type a date. Stands
 * down with the other bare letters: app-locked, typing, an `e`… sequence
 * armed (`e` then `g` is RSVP), or event jump owning letters. Also stands
 * down while a Google connection notice (banner or toast) owns `G` for its
 * own Reconnect / Retry / Refresh action, so that action wins the key.
 */
export function useGoToDateShortcut() {
  useBareLetterShortcut(
    GO_TO_DATE_LETTER,
    () => {
      if (isNoticeActionKeyActive(CONNECTION_BANNER_SHORTCUT_KEY)) {
        return false;
      }
      settingsActions.openCmdPalette();
      return true;
    },
    "nav-go-to-date",
  );
}
