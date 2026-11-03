#!/usr/bin/env bash
# Appends stripe.syntheticJourneyDiscountId when STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID
# is set. Sourced from _deploy-environment.yml inside the hosted-cloud stripe block;
# tested via deploy-journey-config.test.ts.

write_stripe_synthetic_journey_discount() {
  if [ -z "${STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID:-}" ]; then
    echo "Stripe config: omitting syntheticJourneyDiscountId (STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID unset)" >&2
    return 0
  fi

  printf '%s\n' "  syntheticJourneyDiscountId: \"${STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID}\""
  echo "Stripe config: synthetic journey discount id configured" >&2
}
