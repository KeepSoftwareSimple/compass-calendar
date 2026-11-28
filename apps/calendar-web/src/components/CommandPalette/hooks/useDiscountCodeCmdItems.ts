import { CreditCardIcon } from "@phosphor-icons/react/dist/csr/CreditCard";
import { useRouter } from "@tanstack/react-router";
import { useStripePublishableKey } from "@web/billing/billing.query";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";

export function useDiscountCodeCmdItems(): CommandItem[] {
  const router = useRouter();
  const publishableKey = useStripePublishableKey();

  if (!publishableKey) return [];

  return [
    {
      id: "redeem-offer",
      label: "Discount codes",
      icon: CreditCardIcon,
      keywords: ["coupon", "offer", "promo", "promotion", "checkout"],
      onClick: () =>
        void router.navigate({
          to: ".",
          search: (previous) => ({ ...previous, checkout: 1 }),
        }),
    },
  ];
}
