import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { useUpgradeConfirmation } from "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation";
import { useIsTrialing } from "@web/billing/useIsTrialing";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";

/** Offered while a Stripe-backed trial is running. */
export const useUpgradeCmdItems = (): CommandItem[] => {
  const isTrialing = useIsTrialing();
  const { openUpgradeConfirmation } = useUpgradeConfirmation();

  if (!isTrialing) {
    return [];
  }

  const subscribe = () => {
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
