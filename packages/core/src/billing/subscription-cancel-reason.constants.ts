/** Stable slugs for optional subscription cancel feedback (web + macOS). */
export const SUBSCRIPTION_CANCEL_REASONS = [
  { slug: "too_expensive", label: "Too expensive" },
  { slug: "missing_feature", label: "Missing a feature" },
  { slug: "switched_tool", label: "Switched to another tool" },
  { slug: "not_using_enough", label: "Not using it enough" },
  { slug: "technical_problems", label: "Technical problems" },
  { slug: "other", label: "Other" },
] as const;

export type SubscriptionCancelReasonSlug =
  (typeof SUBSCRIPTION_CANCEL_REASONS)[number]["slug"];
