/** Stripe expandable fields arrive as either an id string or `{ id: string }`. */
export const stripeExpandableId = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return undefined;
};
