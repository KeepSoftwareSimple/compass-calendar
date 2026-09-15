/**
 * Meeting dashboard and release-monitoring contract (WP-12).
 *
 * Browser funnels and server operations are different populations. Do not
 * join `booking_reservation_created` to `booking_operation` as one rate.
 * A missing sample is not 0% failure or 100% success.
 *
 * Live dashboard: https://us.posthog.com/project/165441/dashboard/2093461
 * Sync health (reuse, do not duplicate): 1905421
 * Web vitals (reuse): 2058733
 */

import {
  BOOKING_OPERATION_EVENT,
  BOOKING_OPERATION_HEARTBEAT_EVENT,
  BOOKING_OPERATION_HEARTBEAT_INTERVAL_MS,
  type BookingLifecycleOutcome,
} from "@core/types/booking-lifecycle.contracts";

export { BOOKING_OPERATION_EVENT, BOOKING_OPERATION_HEARTBEAT_EVENT };

export const MEETING_DASHBOARD_ID = 2093461;
export const MEETING_DASHBOARD_URL =
  "https://us.posthog.com/project/165441/dashboard/2093461";
export const SYNC_HEALTH_DASHBOARD_URL =
  "https://us.posthog.com/project/165441/dashboard/1905421";
export const WEB_VITALS_DASHBOARD_URL =
  "https://us.posthog.com/project/165441/dashboard/2058733";
export const POSTHOG_ALERTS_URL =
  "https://us.posthog.com/project/165441/alerts";
export const POST_LAUNCH_FEEDBACK_ISSUE =
  "https://github.com/KeepSoftwareSimple/compass-calendar/issues/3720";

export const HOST_FUNNEL_EVENTS = [
  "booking_settings_opened",
  "booking_page_enabled",
  "booking_link_copied",
] as const;

export const GUEST_FUNNEL_EVENTS = [
  "booking_page_viewed",
  "booking_reservation_created",
] as const;

export const GUEST_PATH_EVENTS = [
  "booking_page_viewed",
  "booking_slots_loaded",
  "booking_slot_selected",
  "booking_details_reached",
  "booking_submit_attempted",
  "booking_reservation_created",
] as const;

export const HOST_CONVERSION_WINDOW = {
  interval: 7,
  unit: "day",
} as const;

export const GUEST_CONVERSION_WINDOW = {
  interval: 1,
  unit: "day",
} as const;

export const HEARTBEAT_CADENCE_MS = BOOKING_OPERATION_HEARTBEAT_INTERVAL_MS;
export const HEARTBEAT_ABSENCE_INTERVALS = 2;
export const HEARTBEAT_ABSENCE_WINDOW_MS =
  HEARTBEAT_CADENCE_MS * HEARTBEAT_ABSENCE_INTERVALS;
export const OLDEST_PENDING_ACTIONABLE_MS = 5 * 60 * 1000;
export const INFRA_FAILURE_WINDOW_MS = 30 * 60 * 1000;
export const INFRA_FAILURE_MIN_ACCEPTED = 20;
export const INFRA_FAILURE_RATE_THRESHOLD = 0.05;

export const INFRA_FAILURE_OUTCOMES = [
  "provider",
  "storage",
  "transport",
] as const satisfies ReadonlyArray<BookingLifecycleOutcome>;

export const PRODUCTION_EXCLUSIONS =
  "environment=production; PostHog filter-test-accounts on Trends and Funnel tiles";
export const STAGING_EXCLUSIONS =
  "environment=staging; test accounts included so authorized staging fixtures remain visible";

export type RateSample = {
  numerator: number;
  denominator: number;
};

export type RateResult = {
  rate: number | null;
  numerator: number;
  denominator: number;
  sampleCount: number;
  status: "ok" | "no-data";
};

export function rateFromCounts(sample: RateSample): RateResult {
  if (sample.denominator <= 0) {
    return {
      rate: null,
      numerator: sample.numerator,
      denominator: 0,
      sampleCount: 0,
      status: "no-data",
    };
  }
  return {
    rate: sample.numerator / sample.denominator,
    numerator: sample.numerator,
    denominator: sample.denominator,
    sampleCount: sample.denominator,
    status: "ok",
  };
}

export type AlertDecision = {
  actionable: boolean;
  reason: string;
};

export function exhaustedRecoveryAlert(exhaustedCount: number): AlertDecision {
  if (exhaustedCount > 0) {
    return {
      actionable: true,
      reason: "exhausted recovery or consistency violation",
    };
  }
  return { actionable: false, reason: "no exhausted recoveries" };
}

export function oldestPendingAlert(
  consecutiveAgesMs: Array<number | null>,
): AlertDecision {
  if (consecutiveAgesMs.length < 2) {
    return {
      actionable: false,
      reason: "need two consecutive heartbeat evaluations",
    };
  }
  const latest = consecutiveAgesMs.slice(-2);
  const bothOld = latest.every(
    (age) => age !== null && age > OLDEST_PENDING_ACTIONABLE_MS,
  );
  if (bothOld) {
    return {
      actionable: true,
      reason: "oldest pending older than 5 minutes on two consecutive samples",
    };
  }
  return {
    actionable: false,
    reason: "pending age is empty or recovered within 5 minutes",
  };
}

export function infrastructureFailureAlert(input: {
  accepted: number;
  infraFailures: number;
}): AlertDecision {
  const measured = rateFromCounts({
    numerator: input.infraFailures,
    denominator: input.accepted,
  });
  if (measured.status === "no-data") {
    return {
      actionable: false,
      reason:
        "no-data: fewer than one accepted operation, not a 0% failure rate",
    };
  }
  if (input.accepted < INFRA_FAILURE_MIN_ACCEPTED) {
    return {
      actionable: false,
      reason: `low volume: ${input.accepted} accepted, need ${INFRA_FAILURE_MIN_ACCEPTED} over 30 minutes; review counts manually`,
    };
  }
  if ((measured.rate ?? 0) > INFRA_FAILURE_RATE_THRESHOLD) {
    return {
      actionable: true,
      reason: "provider/storage/transport failure rate above 5% with sample",
    };
  }
  return {
    actionable: false,
    reason: "infrastructure failure rate at or below 5%",
  };
}

export function heartbeatAbsenceAlert(input: {
  sampleCount: number;
  windowMs: number;
}): AlertDecision {
  if (input.windowMs < HEARTBEAT_ABSENCE_WINDOW_MS) {
    return {
      actionable: false,
      reason: "window shorter than two expected heartbeat intervals",
    };
  }
  if (input.sampleCount === 0) {
    return {
      actionable: true,
      reason:
        "heartbeat absent for two expected intervals, distinct from zero traffic",
    };
  }
  return { actionable: false, reason: "heartbeat samples present" };
}

export function idleQueueIsNotMissingTelemetry(input: {
  sampleCount: number;
  pendingCount: number;
}): boolean {
  return input.sampleCount > 0 && input.pendingCount === 0;
}

export const MEETING_SAVED_INSIGHTS = {
  "host-funnel-production":
    "https://us.posthog.com/project/165441/insights/qmA6YEpq",
  "guest-funnel-production":
    "https://us.posthog.com/project/165441/insights/Bpjfok7y",
  "host-funnel-staging":
    "https://us.posthog.com/project/165441/insights/8jOUswJq",
  "guest-funnel-staging":
    "https://us.posthog.com/project/165441/insights/8DA2BrvI",
  "server-operations":
    "https://us.posthog.com/project/165441/insights/jC0leWid",
  "server-outcomes": "https://us.posthog.com/project/165441/insights/TzMzEeKF",
  "completion-latency":
    "https://us.posthog.com/project/165441/insights/1MDTnQpk",
  "completion-rate-30m":
    "https://us.posthog.com/project/165441/insights/4YNwF8bh",
  "infra-failure-rate-30m":
    "https://us.posthog.com/project/165441/insights/PqXHdek3",
  "heartbeat-freshness":
    "https://us.posthog.com/project/165441/insights/6kjX0jtM",
  "exhausted-recoveries":
    "https://us.posthog.com/project/165441/insights/L1penOJD",
  "setup-save-failures":
    "https://us.posthog.com/project/165441/insights/i3nZgQ5l",
} as const;

export const MEETING_INSIGHTS = [
  {
    key: "host-funnel-production",
    name: "Meeting host funnel (production)",
    population: "browser-host",
    events: HOST_FUNNEL_EVENTS,
    window: HOST_CONVERSION_WINDOW,
    exclusions: PRODUCTION_EXCLUSIONS,
    filterTestAccounts: true,
    environment: "production",
    aggregation: "unique users",
  },
  {
    key: "guest-funnel-production",
    name: "Meeting guest funnel (production)",
    population: "browser-guest",
    events: GUEST_FUNNEL_EVENTS,
    window: GUEST_CONVERSION_WINDOW,
    exclusions: PRODUCTION_EXCLUSIONS,
    filterTestAccounts: true,
    environment: "production",
    aggregation: "unique sessions",
  },
  {
    key: "host-funnel-staging",
    name: "Meeting host funnel (staging fixtures)",
    population: "browser-host",
    events: HOST_FUNNEL_EVENTS,
    window: HOST_CONVERSION_WINDOW,
    exclusions: STAGING_EXCLUSIONS,
    filterTestAccounts: false,
    environment: "staging",
    aggregation: "unique users",
  },
  {
    key: "guest-funnel-staging",
    name: "Meeting guest funnel (staging fixtures)",
    population: "browser-guest",
    events: GUEST_FUNNEL_EVENTS,
    window: GUEST_CONVERSION_WINDOW,
    exclusions: STAGING_EXCLUSIONS,
    filterTestAccounts: false,
    environment: "staging",
    aggregation: "unique sessions",
  },
  {
    key: "server-operations",
    name: "Meeting server operations by phase",
    population: "server-operation",
    events: [BOOKING_OPERATION_EVENT],
    window: { interval: 7, unit: "day" },
    exclusions: PRODUCTION_EXCLUSIONS,
    filterTestAccounts: true,
    environment: "production",
    aggregation: "event count",
  },
  {
    key: "heartbeat-freshness",
    name: "Meeting heartbeat freshness",
    population: "server-heartbeat",
    events: [BOOKING_OPERATION_HEARTBEAT_EVENT],
    window: { interval: 10, unit: "minute" },
    exclusions: PRODUCTION_EXCLUSIONS,
    filterTestAccounts: true,
    environment: "production",
    aggregation: "event count",
  },
] as const;

export type MeetingInsightPopulation =
  (typeof MEETING_INSIGHTS)[number]["population"];

export function populationsAreSeparate(
  left: MeetingInsightPopulation,
  right: MeetingInsightPopulation,
): boolean {
  return left !== right;
}
