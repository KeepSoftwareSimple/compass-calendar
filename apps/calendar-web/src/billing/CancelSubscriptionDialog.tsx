import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

interface CancelSubscriptionDialogProps {
  isOpen: boolean;
  isSubmitting: boolean;
  isTrialing: boolean;
  periodEndLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirms scheduling cancel-at-period-end. Access continues until the
 * named date; resume is available until then.
 */
export function CancelSubscriptionDialog({
  isOpen,
  isSubmitting,
  isTrialing,
  periodEndLabel,
  onCancel,
  onConfirm,
}: CancelSubscriptionDialogProps) {
  if (!isOpen) return null;

  const message = isTrialing
    ? `You keep access until the trial ends on ${periodEndLabel}. You can resume any time before then.`
    : `Your plan stays active until ${periodEndLabel}. You can resume any time before then.`;

  const dismiss = () => {
    if (isSubmitting) return;
    onCancel();
  };

  return (
    <OverlayPanel
      title="Cancel your plan?"
      message={message}
      onDismiss={dismiss}
      align="start"
      variant="modal"
    >
      <OverlayPanelActions align="start">
        <OverlayPanelActionButton
          variant="destructive"
          shortcut="Enter"
          disabled={isSubmitting}
          onClick={onConfirm}
        >
          {isSubmitting ? "Canceling…" : "Cancel subscription"}
        </OverlayPanelActionButton>
        <OverlayPanelActionButton
          shortcut="Esc"
          disabled={isSubmitting}
          onClick={dismiss}
        >
          Keep plan
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
}
