import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

interface DeleteAccountFailureDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onRetry: () => void;
}

export function DeleteAccountFailureDialog({
  isOpen,
  onCancel,
  onRetry,
}: DeleteAccountFailureDialogProps) {
  if (!isOpen) return null;

  return (
    <OverlayPanel
      title="Couldn't delete your account"
      message="Something went wrong, and your account is still here."
      onDismiss={onCancel}
      align="start"
      variant="modal"
    >
      <OverlayPanelActions align="start">
        <OverlayPanelActionButton
          variant="primary"
          shortcut="Enter"
          onClick={onRetry}
        >
          Try again
        </OverlayPanelActionButton>
        <OverlayPanelActionButton shortcut="Esc" onClick={onCancel}>
          Cancel
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
}
