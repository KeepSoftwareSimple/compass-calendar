import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { useEffect } from "react";
import { useUpgradeConfirmation } from "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation";
import { useIsAppAccessPending } from "@web/billing/useAppAccess";
import { useIsTrialing } from "@web/billing/useIsTrialing";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";

export const SUBSCRIBE_PENDING_CMD_ID = "subscribe-now-pending";

const readLastSeenTrialing = () =>
  persistentBrowserStore.get(STORAGE_KEYS.LAST_SEEN_TRIALING) === "true";

/** Offered while a Stripe-backed trial is running. */
export const useUpgradeCmdItems = (): CommandItem[] => {
  const isTrialing = useIsTrialing();
  const isAccessPending = useIsAppAccessPending();
  const { openUpgradeConfirmation } = useUpgradeConfirmation();

  // Remember the last answer so the next load can hold this row's slot
  // only for browsers that will most likely show it.
  useEffect(() => {
    if (isAccessPending) return;
    if (isTrialing) {
      persistentBrowserStore.set(STORAGE_KEYS.LAST_SEEN_TRIALING, "true");
    } else {
      persistentBrowserStore.remove(STORAGE_KEYS.LAST_SEEN_TRIALING);
    }
  }, [isAccessPending, isTrialing]);

  if (isAccessPending && readLastSeenTrialing()) {
    return [
      {
        id: SUBSCRIBE_PENDING_CMD_ID,
        label: "Subscribe now",
        icon: CreditCardIcon,
        disabled: true,
      },
    ];
  }

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
