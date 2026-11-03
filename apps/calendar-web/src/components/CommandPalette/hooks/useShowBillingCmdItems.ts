import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { useSession } from "@web/auth/compass/session/useSession";
import { cardUpdateActions } from "@web/billing/card-update.store";
import { getPlanBadge } from "@web/billing/planBadge";
import { useAppAccess, useIsAppAccessPending } from "@web/billing/useAppAccess";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { settingsActions } from "@web/settings/settings.store";

export const BILLING_PENDING_CMD_IDS = {
  "show-billing": "show-billing-pending",
  "update-card": "update-card-pending",
} as const;

/** Opens Settings on Billing when the install actually has a plan to report. */
export const useShowBillingCmdItems = (): CommandItem[] => {
  const { authenticated } = useSession();
  const access = useAppAccess();
  const isAccessPending = useIsAppAccessPending();
  const badge = getPlanBadge(access);

  // Hold both rows while the plan loads, so the rows below them don't drop
  // when billing lands a beat after the palette opens.
  if (authenticated && isAccessPending) {
    return [
      {
        id: BILLING_PENDING_CMD_IDS["show-billing"],
        label: "Manage Billing",
        icon: CreditCardIcon,
        disabled: true,
      },
      {
        id: BILLING_PENDING_CMD_IDS["update-card"],
        label: "Update card",
        icon: CreditCardIcon,
        disabled: true,
      },
    ];
  }

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
