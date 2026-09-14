import {
  BOOKING_OPERATION_EVENT,
  BOOKING_OPERATION_HEARTBEAT_EVENT,
  exhaustedRecoveryAlert,
  GUEST_CONVERSION_WINDOW,
  GUEST_FUNNEL_EVENTS,
  GUEST_PATH_EVENTS,
  HEARTBEAT_ABSENCE_WINDOW_MS,
  HEARTBEAT_CADENCE_MS,
  HOST_CONVERSION_WINDOW,
  HOST_FUNNEL_EVENTS,
  heartbeatAbsenceAlert,
  INFRA_FAILURE_MIN_ACCEPTED,
  INFRA_FAILURE_OUTCOMES,
  INFRA_FAILURE_WINDOW_MS,
  idleQueueIsNotMissingTelemetry,
  infrastructureFailureAlert,
  MEETING_DASHBOARD_ID,
  MEETING_DASHBOARD_URL,
  MEETING_INSIGHTS,
  MEETING_SAVED_INSIGHTS,
  oldestPendingAlert,
  POST_LAUNCH_FEEDBACK_ISSUE,
  POSTHOG_ALERTS_URL,
  populationsAreSeparate,
  rateFromCounts,
  SYNC_HEALTH_DASHBOARD_URL,
  WEB_VITALS_DASHBOARD_URL,
} from "../telemetry/meeting-dashboard";
import { describe, expect, it } from "bun:test";

describe("meeting dashboard rates", () => {
  it("treats a zero denominator as no-data, not 0% failure or 100% success", () => {
    expect(rateFromCounts({ numerator: 0, denominator: 0 })).toEqual({
      rate: null,
      numerator: 0,
      denominator: 0,
      sampleCount: 0,
      status: "no-data",
    });
    expect(rateFromCounts({ numerator: 4, denominator: 0 }).rate).toBeNull();
  });

  it("reports numerator, denominator, and sample count when data exists", () => {
    expect(rateFromCounts({ numerator: 2, denominator: 5 })).toEqual({
      rate: 0.4,
      numerator: 2,
      denominator: 5,
      sampleCount: 5,
      status: "ok",
    });
  });
});

describe("meeting dashboard populations", () => {
  it("keeps browser funnels and server operations as separate populations", () => {
    expect(GUEST_FUNNEL_EVENTS).not.toContain(BOOKING_OPERATION_EVENT);
    expect(HOST_FUNNEL_EVENTS).not.toContain(BOOKING_OPERATION_EVENT);
    expect(GUEST_FUNNEL_EVENTS).not.toContain(
      BOOKING_OPERATION_HEARTBEAT_EVENT,
    );
    expect(
      populationsAreSeparate("browser-guest", "server-operation"),
    ).toBeTrue();
    expect(populationsAreSeparate("browser-host", "browser-guest")).toBeTrue();
  });

  it("documents conversion windows and exclusions on every insight", () => {
    expect(HOST_CONVERSION_WINDOW).toEqual({ interval: 7, unit: "day" });
    expect(GUEST_CONVERSION_WINDOW).toEqual({ interval: 1, unit: "day" });
    for (const insight of MEETING_INSIGHTS) {
      expect(insight.window.interval).toBeGreaterThan(0);
      expect(insight.exclusions.length).toBeGreaterThan(0);
      expect(
        insight.environment === "production" ||
          insight.environment === "staging",
      ).toBeTrue();
    }
  });
});

describe("meeting dashboard alerts", () => {
  it("makes any exhausted recovery actionable", () => {
    expect(exhaustedRecoveryAlert(0).actionable).toBeFalse();
    expect(exhaustedRecoveryAlert(1)).toEqual({
      actionable: true,
      reason: "exhausted recovery or consistency violation",
    });
  });

  it("requires two consecutive old pending samples before paging", () => {
    expect(oldestPendingAlert([301_000]).actionable).toBeFalse();
    expect(oldestPendingAlert([301_000, 120_000]).actionable).toBeFalse();
    expect(oldestPendingAlert([null, 301_000]).actionable).toBeFalse();
    expect(oldestPendingAlert([301_000, 360_000]).actionable).toBeTrue();
  });

  it("does not treat low-volume infrastructure failures as a rate fire", () => {
    expect(
      infrastructureFailureAlert({
        accepted: INFRA_FAILURE_MIN_ACCEPTED - 1,
        infraFailures: 10,
      }).actionable,
    ).toBeFalse();
    expect(
      infrastructureFailureAlert({ accepted: 0, infraFailures: 0 }).reason,
    ).toContain("no-data");
  });

  it("pages when provider storage or transport failures exceed 5% with sample", () => {
    expect(
      infrastructureFailureAlert({ accepted: 20, infraFailures: 1 }).actionable,
    ).toBeFalse();
    expect(
      infrastructureFailureAlert({ accepted: 20, infraFailures: 2 }).actionable,
    ).toBeTrue();
  });

  it("separates missing heartbeats from an idle queue", () => {
    expect(
      heartbeatAbsenceAlert({
        sampleCount: 0,
        windowMs: HEARTBEAT_ABSENCE_WINDOW_MS,
      }).actionable,
    ).toBeTrue();
    expect(
      heartbeatAbsenceAlert({
        sampleCount: 2,
        windowMs: HEARTBEAT_ABSENCE_WINDOW_MS,
      }).actionable,
    ).toBeFalse();
    expect(
      idleQueueIsNotMissingTelemetry({ sampleCount: 2, pendingCount: 0 }),
    ).toBeTrue();
    expect(
      idleQueueIsNotMissingTelemetry({ sampleCount: 0, pendingCount: 0 }),
    ).toBeFalse();
  });
});

describe("meeting dashboard fixtures", () => {
  it("classifies synthetic success, failure, pending, recovery, and no-data", () => {
    const success = rateFromCounts({ numerator: 8, denominator: 10 });
    const failure = infrastructureFailureAlert({
      accepted: 20,
      infraFailures: 3,
    });
    const pending = oldestPendingAlert([400_000, 410_000]);
    const recovery = exhaustedRecoveryAlert(2);
    const noData = rateFromCounts({ numerator: 0, denominator: 0 });

    expect(success.status).toBe("ok");
    expect(success.rate).toBe(0.8);
    expect(failure.actionable).toBeTrue();
    expect(pending.actionable).toBeTrue();
    expect(recovery.actionable).toBeTrue();
    expect(noData.status).toBe("no-data");
    expect(noData.rate).toBeNull();
  });

  it("points at the live Meeting dashboard and saved insights", () => {
    expect(MEETING_DASHBOARD_ID).toBe(2093461);
    expect(MEETING_DASHBOARD_URL).toContain("/dashboard/2093461");
    expect(SYNC_HEALTH_DASHBOARD_URL).toContain("/dashboard/1905421");
    expect(WEB_VITALS_DASHBOARD_URL).toContain("/dashboard/2058733");
    expect(POSTHOG_ALERTS_URL).toContain("/alerts");
    expect(POST_LAUNCH_FEEDBACK_ISSUE).toContain("/issues/3720");
    expect(GUEST_PATH_EVENTS[0]).toBe("booking_page_viewed");
    expect(GUEST_PATH_EVENTS).toContain("booking_reservation_created");
    expect(GUEST_FUNNEL_EVENTS).toEqual([
      "booking_page_viewed",
      "booking_reservation_created",
    ]);
    expect(INFRA_FAILURE_OUTCOMES).toEqual([
      "provider",
      "storage",
      "transport",
    ]);
    expect(INFRA_FAILURE_WINDOW_MS).toBe(30 * 60 * 1000);
    expect(HEARTBEAT_CADENCE_MS).toBe(5 * 60 * 1000);
    for (const insight of MEETING_INSIGHTS) {
      expect(MEETING_SAVED_INSIGHTS[insight.key]).toContain("/insights/");
    }
  });
});
