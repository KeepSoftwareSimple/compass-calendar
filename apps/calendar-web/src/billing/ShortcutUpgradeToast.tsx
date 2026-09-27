import { type Id } from "react-toastify";
import { track } from "@web/auth/posthog/track";
import { billingPreviewActions } from "@web/billing/billing-preview.store";
import {
  type CheckoutPanelSource,
  checkoutPanelActions,
} from "@web/billing/checkout-panel.store";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

export function ShortcutUpgradeToast({
  toastId,
  parts,
  title,
  ctaLabel,
  checkoutSource,
}: {
  toastId: Id;
  /** The exact key the user pressed, as keycap chips. Absent for callers
   * that only know the feature area (command palette, edit sequence). */
  parts?: readonly ShortcutTipPart[];
  title: string;
  ctaLabel: string;
  checkoutSource: CheckoutPanelSource;
}) {
  const handleUpgrade = () => {
    track("billing_gate_cta_clicked", {
      cta: "shortcut_prompt",
      ...(checkoutSource.actionId
        ? { action_id: checkoutSource.actionId }
        : {}),
    });
    getToast().dismiss(toastId);
    billingPreviewActions.exit();
    checkoutPanelActions.open(checkoutSource);
  };

  return (
    <ToastNotice>
      {parts && (
        <p className="font-medium text-sm text-text">
          <ShortcutTipParts parts={parts} />
        </p>
      )}
      <p className="text-sm text-text">{title}</p>
      <ToastActionButton onClick={handleUpgrade}>{ctaLabel}</ToastActionButton>
    </ToastNotice>
  );
}
