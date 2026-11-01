import { track } from "@web/auth/posthog/track";
import {
  isAwaitingCheckoutForTrialStep,
  syncAwaitingCheckoutWriteLockFromServer,
} from "@web/billing/awaiting-checkout-trial-eligible";
import { openStartTrialStepModal } from "@web/components/AuthModal/auth-modal-runtime";

export type TrialGateTrigger = "write" | "banner";

/** Event write that opened the trial step (create, replace, delete). */
export type TrialGateEventAction = "create" | "replace" | "delete";

let pendingTrigger: TrialGateTrigger | null = null;

export function consumeTrialStepTrigger(): TrialGateTrigger | null {
  const trigger = pendingTrigger;
  pendingTrigger = null;
  return trigger;
}

export function resetTrialStepRequestForTests(): void {
  pendingTrigger = null;
}

/**
 * Opens the in-modal trial step for `awaiting_checkout` accounts. Expired and
 * canceled users keep the full-screen billing gate instead.
 */
export type RequestTrialStepOptions = {
  trigger: TrialGateTrigger;
  eventAction?: TrialGateEventAction;
  /** Set when `/api/event` returned `BILLING_REQUIRED`. */
  serverBillingRequired?: boolean;
};

export async function requestTrialStep(
  options: RequestTrialStepOptions,
): Promise<boolean> {
  if (
    !isAwaitingCheckoutForTrialStep({
      serverBillingRequired: options.serverBillingRequired,
    })
  ) {
    return false;
  }
  if (options.serverBillingRequired) {
    syncAwaitingCheckoutWriteLockFromServer();
  }

  pendingTrigger = options.trigger;
  track("trial_gate_triggered", {
    source: options.trigger,
    ...(options.eventAction ? { event_action: options.eventAction } : {}),
  });
  track("billing_gate_shown", {
    status: "awaiting_checkout",
    surface: options.trigger === "write" ? "write_attempt" : "explore_banner",
  });
  await openStartTrialStepModal({
    replace: options.trigger === "write",
  });
  return true;
}

/**
 * Blocks an event write for `awaiting_checkout` and opens the trial step.
 * Returns true when the write must not proceed.
 */
export function blockAwaitingCheckoutEventWrite(
  eventAction: TrialGateEventAction,
): boolean {
  if (!isAwaitingCheckoutForTrialStep()) return false;
  void requestTrialStep({ trigger: "write", eventAction });
  return true;
}
