import {
  formatTrialBadgeLabel,
  getTrialDaysLeft,
} from "@web/billing/trialDaysLeft";
import { type AppAccess } from "@web/billing/useAppAccess";

export type PlanBadgeTone = "premium" | "trial" | "attention" | "neutral";

export type PlanBadge = { label: string; tone: PlanBadgeTone };

// Tone only decorates a label that already says what the plan is; the pill is
// never colour alone. Same contract as SYNC_STATUS_VARIANT_CLASSNAME.
export const PLAN_BADGE_TONE_CLASSNAME: Record<PlanBadgeTone, string> = {
  premium: "text-success",
  trial: "text-text",
  attention: "text-warning",
  neutral: "text-text-muted",
};

/**
 * The one mapping from access state to the plan pill, shared by the Settings
 * panel and the command palette row so the two surfaces a user compares in
 * the same breath cannot drift.
 *
 * Returns null wherever there is no plan to speak of: self-hosted installs,
 * a paused enforcement switch, and anonymous visitors all read `open`, and
 * showing them billing chrome would invent a product they do not have.
 */
export function getPlanBadge(access: AppAccess): PlanBadge | null {
  if (access.kind !== "server") return null;

  switch (access.status) {
    case "active":
      return { label: "Premium", tone: "premium" };
    case "trialing":
      return {
        label: access.trialEndsAt
          ? `Trial · ${formatTrialBadgeLabel(getTrialDaysLeft(access.trialEndsAt))}`
          : "Trial",
        tone: "trial",
      };
    case "past_due":
      return { label: "Payment due", tone: "attention" };
    case "awaiting_checkout":
      return { label: "Free", tone: "neutral" };
    case "expired":
    case "canceled":
      return { label: "Expired", tone: "attention" };
    case "none":
      return null;
  }
}
