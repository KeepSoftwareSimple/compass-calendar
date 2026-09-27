import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { useSession } from "@web/auth/compass/session/useSession";
import { cardUpdateActions } from "@web/billing/card-update.store";
import { getPlanBadge } from "@web/billing/planBadge";
import { useAppAccess } from "@web/billing/useAppAccess";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { settingsActions } from "@web/settings/settings.store";

/** Opens Settings on Billing when the install actually has a plan to report. */
export const useShowBillingCmdItems = (): CommandItem[] => {
  const { authenticated } = useSession();
  const access = useAppAccess();
  const badge = getPlanBadge(access);

  if (!authenticated || !badge) {
    return [];
  }

  return [
    {
      id: "show-billing",
      label: "Manage Billing",
      icon: CreditCardIcon,
      keywords: [
        "plan",
        "billing",
        "subscription",
        "premium",
        "trial",
        "payment",
        "invoice",
        "card",
      ],
      badge: badge.label,
      onClick: () =>
        settingsActions.openSettings("billing", { fromPalette: true }),
    },
    {
      id: "update-card",
      label: "Update card",
      icon: CreditCardIcon,
      keywords: ["card", "payment", "billing", "update"],
      onClick: () => {
        cardUpdateActions.open();
        settingsActions.openSettings("billing", { fromPalette: true });
      },
    },
  ];
};
