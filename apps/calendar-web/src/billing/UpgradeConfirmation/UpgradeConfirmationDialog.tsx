import { useRef } from "react";
import { OVERLAY_LETTER_SHORTCUT } from "@web/billing/overlay-letter-shortcut";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

interface UpgradeConfirmationDialogProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onManageBilling: () => void;
}

/**
 * Confirms starting a Stripe subscription before the trial runs out. No amount
 * is shown here on purpose: the price lives on the Stripe Price, not in this
 * codebase, so operators can change it without a web deploy. "Manage billing"
 * opens Settings on Billing and does not charge today; Start Premium is the
 * only way to end the trial early.
 */
export function UpgradeConfirmationDialog({
  isOpen,
  isSubmitting,
  onCancel,
  onConfirm,
  onManageBilling,
}: UpgradeConfirmationDialogProps) {
  const manageBillingRef = useRef<HTMLButtonElement>(null);
  const overlayShortcut = {
    enabled: isOpen,
    ...OVERLAY_LETTER_SHORTCUT,
  } as const;

  useAppShortcut(
    "Escape",
    () => {
      if (isSubmitting) return;
      onCancel();
    },
    overlayShortcut,
  );

  useAppShortcut(
    "M",
    () => {
      if (isSubmitting) return;
      manageBillingRef.current?.focus({ preventScroll: true });
      onManageBilling();
    },
    overlayShortcut,
  );

  if (!isOpen) return null;

  return (
    <OverlayPanel
      title="Start Premium now?"
      message="Premium starts right away and the card on file is charged today. Everything in your calendar keeps working, and the trial badge goes away. Manage billing opens your invoices and card on file. It does not charge you or end the trial."
      onDismiss={onCancel}
      align="start"
      variant="modal"
    >
      <div className="flex w-full flex-col items-start gap-4">
        <OverlayPanelActions align="start">
          <OverlayPanelActionButton
            variant="primary"
            shortcut="Enter"
            disabled={isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting ? "Starting Premium…" : "Start Premium"}
          </OverlayPanelActionButton>
          <OverlayPanelActionButton
            shortcut="Esc"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </OverlayPanelActionButton>
        </OverlayPanelActions>
        <OverlayPanelActionButton
          ref={manageBillingRef}
          variant="ghost"
          shortcut="M"
          disabled={isSubmitting}
          onClick={onManageBilling}
        >
          Manage billing
        </OverlayPanelActionButton>
      </div>
    </OverlayPanel>
  );
}
