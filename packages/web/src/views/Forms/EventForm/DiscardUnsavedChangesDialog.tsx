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
          {/* Phosphor X regular: inlined so this dismiss control is not a shared boot chunk. */}
          <svg
            aria-hidden="true"
            fill="currentColor"
            height={16}
            viewBox="0 0 256 256"
            width={16}
          >
            <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
          </svg>
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
