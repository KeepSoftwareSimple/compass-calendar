import { settingsActions } from "@web/settings/settings.store";
import { GO_TO_DATE_LETTER } from "@web/shortcuts/go-to-date/go-to-date.constants";
import { useBareLetterShortcut } from "@web/shortcuts/useBareLetterShortcut";

/**
 * Bare `G` opens the command palette so the user can type a date. Stands
 * down with the other bare letters: app-locked, typing, an `e`… sequence
 * armed (`e` then `g` is RSVP), or event jump owning letters.
 */
export function useGoToDateShortcut() {
  useBareLetterShortcut(
    GO_TO_DATE_LETTER,
    () => {
      settingsActions.openCmdPalette();
      return true;
    },
    "nav-go-to-date",
  );
}
