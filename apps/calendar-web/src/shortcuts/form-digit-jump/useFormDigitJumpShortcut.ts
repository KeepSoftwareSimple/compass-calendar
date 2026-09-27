import { focusEventFormField } from "@web/common/utils/form/form.util";
import { physicalDigitIndex } from "@web/shortcuts/digit-pick.util";
import { FORM_FIELD_DIGITS } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { useModHoldHintShortcut } from "@web/shortcuts/mod-hold/useModHoldHintShortcut";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";

/**
 * Mod+digit jumps focus straight to a form field (1=title ... 9=description,
 * 0=actions, -=RSVP, ==meeting link; see edit-sequence.fields.ts for the
 * assignment). Holding
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
      const field =
        index !== null ? FORM_FIELD_DIGITS[index]?.field : undefined;
      if (!field) return false;

      focusEventFormField(field);
      recordHandledShortcutInvocation(
        field === "actions" ? "edit-form-actions" : "edit-jump-field-digit",
      );
      return true;
    },
  });
}
