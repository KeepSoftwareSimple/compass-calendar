import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { checkoutPanelActions } from "@web/billing/checkout-panel.store";
import { useUpgradeConfirmation } from "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation";
import { useAppAccess } from "@web/billing/useAppAccess";
import { useIsTrialing } from "@web/billing/useIsTrialing";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";

/** Offered while a trial is running. Local trials open Checkout; Stripe
 * trials still confirm ending the trial early. */
export const useUpgradeCmdItems = (): CommandItem[] => {
  const isTrialing = useIsTrialing();
  const access = useAppAccess();
  const { openUpgradeConfirmation } = useUpgradeConfirmation();

  if (!isTrialing) {
    return [];
  }

  const subscribe = () => {
    if (access.kind === "server" && access.needsPaymentMethod) {
      checkoutPanelActions.open();
      return;
    }
    openUpgradeConfirmation();
  };

  return [
    {
      id: "subscribe-now",
      label: "Subscribe now",
      icon: CreditCardIcon,
      keywords: [
        "billing",
        "subscribe",
        "trial",
        "pay",
        "premium",
        "upgrade",
        "payment",
      ],
      onClick: subscribe,
    },
  ];
};
