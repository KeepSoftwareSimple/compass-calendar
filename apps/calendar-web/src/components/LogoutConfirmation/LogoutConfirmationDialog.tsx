import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

interface LogoutConfirmationDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmationDialog({
  isOpen,
  onCancel,
  onConfirm,
}: LogoutConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <OverlayPanel
      title="Log out?"
      message="Your synced events will be hidden until you log back in."
      onDismiss={onCancel}
      align="start"
      variant="modal"
    >
      <OverlayPanelActions align="start">
        <OverlayPanelActionButton
          variant="primary"
          shortcut="Enter"
          onClick={onConfirm}
        >
          Log out
        </OverlayPanelActionButton>
        <OverlayPanelActionButton shortcut="Esc" onClick={onCancel}>
          Cancel
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
}
