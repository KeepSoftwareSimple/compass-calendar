import { focusEventFormField } from "@web/common/utils/form/form.util";
import { physicalDigitIndex } from "@web/shortcuts/digit-pick.util";
import {
  EDIT_SEQUENCE_FIELD_BY_DIGIT,
  FORM_FIELD_DIGITS,
} from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { useModHoldHintShortcut } from "@web/shortcuts/mod-hold/useModHoldHintShortcut";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";

export { MOD_HOLD_HINT_MS } from "@web/shortcuts/mod-hold/useModHoldHintShortcut";

/** 0-based physical-digit index -> field digit, i.e. the form's DOM order. */
const DIGIT_ORDER = FORM_FIELD_DIGITS.map((entry) => entry.digit);

/**
 * Mod+digit jumps focus straight to a form field (1=title ... 9=description,
 * 0=actions, -=RSVP; see edit-sequence.fields.ts for the assignment). Holding
 * Mod alone reveals the mapping as hint chips (FormDigitHintOverlay) via the
 * shared hold-Mod engine — the same discoverability contract as the
 * `e`-leader's which-key menu, but driven by a hold instead of a second
 * keypress.
 *
 * Mounted from EventForm, so this hook is live exactly while the form is
 * open; no separate "is the form open" gate is needed.
 */
export function useFormDigitJumpShortcut(): { areHintsVisible: boolean } {
  return useModHoldHintShortcut({
    onHintsRevealed: () =>
      shortcutHintProgressActions.demonstrate("save-draft"),
    onModChord: (event) => {
      const index = physicalDigitIndex(event);
      const digit = index !== null ? DIGIT_ORDER[index] : undefined;
      const field = digit ? EDIT_SEQUENCE_FIELD_BY_DIGIT[digit] : undefined;
      if (!field) return false;

      focusEventFormField(field);
      return true;
    },
  });
}
