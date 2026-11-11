import { endEventPastePreview } from "@web/events/paste-preview/event-paste-preview.lifecycle";
import { isEventPastePreviewActive } from "@web/events/stores/event-paste-preview.store";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/** Esc cancels paste preview without clearing the in-app clipboard. */
export function useEventPastePreviewEscape() {
  useAppShortcut(
    "Escape",
    (event) => {
      if (!isEventPastePreviewActive()) return;
      if (isHigherEscapeOwner()) return;

      event.preventDefault();
      event.stopPropagation();
      endEventPastePreview();
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );
}
