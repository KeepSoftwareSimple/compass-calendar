import { createPortal } from "react-dom";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { getEventFormFieldAnchor } from "@web/common/utils/form/form.util";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { FORM_FIELD_DIGITS } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { getVisibleHintRect } from "@web/shortcuts/shift-hint/shift-hint-visible-rect";
import { useHintLayoutRefresh } from "@web/shortcuts/useHintLayoutRefresh";

/**
 * Numbered keycap chips anchored next to each form field while Mod is held
 * (see useFormDigitJumpShortcut). Portaled like ShiftHintOverlay so the
 * scrollable form body cannot clip a chip on a field near its edge.
 */
export function FormDigitHintOverlay({ visible }: { visible: boolean }) {
  useHintLayoutRefresh(visible);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  // Chip the visible control, not a hidden inner input. Only targets whose
  // anchor is currently rendered get announced or chipped, e.g. the calendar
  // picker (digit 5) isn't rendered on an edit draft, so the shortcut
  // wouldn't do anything there.
  const presentFields = FORM_FIELD_DIGITS.flatMap((entry) => {
    const anchor = getEventFormFieldAnchor(entry.field);
    return anchor ? [{ ...entry, anchor }] : [];
  });

  const srText = `Jump where? ${presentFields
    .map((entry) => `${entry.digit} for ${entry.label.toLowerCase()}`)
    .join(", ")}. Release the modifier to dismiss.`;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0"
      data-form-digit-hints=""
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <span aria-live="polite" className="sr-only" role="status">
        {srText}
      </span>
      <div aria-hidden>
        {presentFields.map((entry) => {
          const visibleRect = getVisibleHintRect(entry.anchor);
          if (!visibleRect) {
            // Scrolled out of view; the shortcut still works, but a
            // portaled chip with nothing to anchor to would float in place.
            return null;
          }

          const chipWidth = 22;

          return (
            <span
              key={entry.field}
              className="absolute"
              style={{
                top: visibleRect.top + 2,
                left: Math.max(4, visibleRect.right - chipWidth),
              }}
            >
              <ShortcutHint>{entry.digit}</ShortcutHint>
            </span>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
