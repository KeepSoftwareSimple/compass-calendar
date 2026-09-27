import { useState } from "react";
import { selectGridDraft, useDraftStore } from "@web/events/stores/draft.store";
import { isFloatingLayerOpen } from "@web/shortcuts/floating-layer";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";
import { shouldConfirmDiscardUnsavedChanges } from "@web/views/Forms/hooks/shouldConfirmDiscardUnsavedChanges";

/**
 * Escape closes the event-details form. Dirty edits of a persisted event
 * confirm first; create drafts and unchanged edits discard immediately.
 * Shift+Escape always discards without prompting.
 * Nested floating layers (menus, listboxes, date pickers) register via
 * `useFloatingLayer` so Escape closes them first.
 *
 * `requestClose` is the same decision without the key: the form's Close
 * action button routes through it so a dirty draft prompts there too,
 * instead of re-deriving the dirty check at the call site.
 */
export const useEscapeToCloseForm = (onClose: () => void) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const requestClose = () => {
    const draft = selectGridDraft(useDraftStore.getState());
    if (shouldConfirmDiscardUnsavedChanges(draft)) {
      setIsConfirmOpen(true);
      return;
    }

    onClose();
  };

  useAppShortcut(
    "Escape",
    (keyboardEvent) => {
      if (isFloatingLayerOpen()) return;

      keyboardEvent.preventDefault();
      requestClose();
    },
    { ignoreInputs: false },
  );

  useAppShortcut(
    "Shift+Escape",
    (keyboardEvent) => {
      if (isFloatingLayerOpen()) return;

      keyboardEvent.preventDefault();
      setIsConfirmOpen(false);
      onClose();
    },
    { ignoreInputs: false },
  );

  return {
    isConfirmOpen,
    requestClose,
    onCancelConfirm: () => setIsConfirmOpen(false),
    onDiscardConfirm: () => {
      setIsConfirmOpen(false);
      onClose();
    },
  };
};
