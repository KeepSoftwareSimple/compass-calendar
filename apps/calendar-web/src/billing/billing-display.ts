import dayjs from "@core/util/date/dayjs";

const INVOICE_STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  open: "Open",
  void: "Void",
  uncollectible: "Uncollectible",
};

/** Stripe amounts are minor units. */
export function formatBillingMoney(
  amountMinor: number,
  currency: string,
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

export function formatBillingDate(iso: string): string {
  return dayjs(iso).format("MMM D, YYYY");
}

export function formatCardOnFile(card: {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}): string {
  const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
  const month = String(card.expMonth).padStart(2, "0");
  const year = String(card.expYear).slice(-2);
  return `${brand} ending in ${card.last4}, expires ${month}/${year}`;
}

export function formatInvoiceStatus(status: string): string {
  const mapped = INVOICE_STATUS_LABEL[status];
  if (mapped) return mapped;
  if (!status) return status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}
