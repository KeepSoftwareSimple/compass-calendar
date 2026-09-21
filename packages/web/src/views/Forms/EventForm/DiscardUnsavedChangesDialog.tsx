import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useRef } from "react";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

export type DiscardUnsavedChangesDialogProps = {
  isOpen: boolean;
  onCancel: () => void;
  onDiscard: () => void;
};

export function DiscardUnsavedChangesDialog({
  isOpen,
  onCancel,
  onDiscard,
}: DiscardUnsavedChangesDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  if (!isOpen) return null;

  return (
    <OverlayPanel
      title="Discard unsaved changes?"
      titleAction={
        <button
          type="button"
          aria-label="Close"
          onClick={onCancel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel"
        >
          <XIcon aria-hidden="true" size={16} />
        </button>
      }
      onDismiss={onCancel}
      onShiftEscape={onDiscard}
      onModEnter={onDiscard}
      initialFocusRef={cancelButtonRef}
      align="start"
      variant="modal"
    >
      <OverlayPanelActions align="end">
        <OverlayPanelActionButton
          ref={cancelButtonRef}
          shortcut="Esc"
          onClick={onCancel}
        >
          Cancel
        </OverlayPanelActionButton>
        <OverlayPanelActionButton
          variant="primary"
          shortcut={["Mod", "Enter"]}
          aria-keyshortcuts="Meta+Enter Control+Enter"
          onClick={onDiscard}
        >
          Discard
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
}
