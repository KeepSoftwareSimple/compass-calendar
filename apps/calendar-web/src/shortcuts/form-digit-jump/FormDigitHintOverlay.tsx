import { FORM_FIELD_DIGITS } from "@core/shortcuts/edit-sequence.fields";
import {
  type EventFormFocusField,
  getEventFormFieldAnchor,
} from "@web/common/utils/form/form.util";
import {
  type DigitHintChip,
  DigitHintChipOverlay,
} from "@web/shortcuts/hint-chips/DigitHintChipOverlay";

/**
 * Numbered keycap chips anchored next to each form field while Mod is held
 * (see useFormDigitJumpShortcut). `highlightField` chips a single field on its
 * own, which is how the pointer-teach hint points at one control.
 */
export function FormDigitHintOverlay({
  visible,
  highlightField = null,
}: {
  visible: boolean;
  highlightField?: EventFormFocusField | null;
}) {
  // Chip the visible control, not a hidden inner input. Only targets whose
  // anchor is currently rendered get announced or chipped, e.g. the calendar
  // picker (digit 5) isn't rendered on an edit draft, so the shortcut
  // wouldn't do anything there.
  const resolveChips = (): DigitHintChip[] => {
    const fieldEntries =
      highlightField !== null
        ? FORM_FIELD_DIGITS.filter((entry) => entry.field === highlightField)
        : FORM_FIELD_DIGITS;

    return fieldEntries.flatMap((entry) => {
      const anchor = getEventFormFieldAnchor(entry.field);
      return anchor
        ? [{ key: entry.field, digit: entry.digit, label: entry.label, anchor }]
        : [];
    });
  };

  return (
    <DigitHintChipOverlay
      resolveChips={resolveChips}
      rootAttribute="data-form-digit-hints"
      srPrompt="Jump where?"
      visible={visible || highlightField !== null}
    />
  );
}
