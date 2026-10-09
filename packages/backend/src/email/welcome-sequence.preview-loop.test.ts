import { ObjectId } from "mongodb";
import { CONFIG } from "@backend/common/constants/config.constants";
import { findWelcomeStep } from "@backend/email/welcome-sequence";
import {
  previewFirstNameFromEmail,
  previewLoopRowId,
  previewLoopScheduleProfile,
  previewLoopSyntheticUserId,
  welcomeUserForSkipIf,
} from "@backend/email/welcome-sequence.preview-loop";
import { afterEach, describe, expect, it } from "bun:test";

describe("welcome sequence preview loop helpers", () => {
  const originalRecipients = [...CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS];
  const originalProfile = CONFIG.EMAIL_SCHEDULE_PROFILE;
  const originalLoopProfile = CONFIG.EMAIL_PREVIEW_LOOP_SCHEDULE_PROFILE;

  afterEach(() => {
    CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS = originalRecipients;
    CONFIG.EMAIL_SCHEDULE_PROFILE = originalProfile;
    CONFIG.EMAIL_PREVIEW_LOOP_SCHEDULE_PROFILE = originalLoopProfile;
  });

  it("derives stable synthetic user ids and row ids per email", () => {
    const first = previewLoopSyntheticUserId("Founder@Example.com");
    const second = previewLoopSyntheticUserId("founder@example.com");
    expect(first.equals(second)).toBe(true);
    expect(previewLoopRowId("founder@example.com", 1, "welcome")).toBe(
      previewLoopRowId("founder@example.com", 1, "welcome"),
    );
    expect(previewLoopRowId("founder@example.com", 2, "welcome")).not.toBe(
      previewLoopRowId("founder@example.com", 1, "welcome"),
    );
  });

  it("defaults loop schedule to real cadence unless overridden", () => {
    CONFIG.EMAIL_SCHEDULE_PROFILE = "fast";
    CONFIG.EMAIL_PREVIEW_LOOP_SCHEDULE_PROFILE = undefined;
    expect(previewLoopScheduleProfile()).toBe("fast");

    CONFIG.EMAIL_PREVIEW_LOOP_SCHEDULE_PROFILE = "real";
    expect(previewLoopScheduleProfile()).toBe("real");
  });

  it("formats a preview first name from the mailbox", () => {
    expect(previewFirstNameFromEmail("ada.lovelace@example.com")).toBe("Ada");
  });

  it("sends skipIf-gated steps during preview loop", () => {
    const connectStep = findWelcomeStep("connect-calendar");
    const trialStep = findWelcomeStep("trial-ending");
    const user = {
      hasConnectedCalendar: true,
      billing: {
        subscriptionStatus: "active" as const,
        stripeSubscriptionId: "sub_123",
      },
    };
    expect(connectStep?.skipIf?.(user)).toBe(true);
    expect(trialStep?.skipIf?.(user)).toBe(true);
    const previewUser = welcomeUserForSkipIf(user, true);
    expect(connectStep?.skipIf?.(previewUser)).toBe(false);
    expect(trialStep?.skipIf?.(previewUser)).toBe(false);
  });

  it("keeps skipIf behavior for non-preview sends", () => {
    const connectStep = findWelcomeStep("connect-calendar");
    const user = { hasConnectedCalendar: true };
    expect(connectStep?.skipIf?.(welcomeUserForSkipIf(user, false))).toBe(true);
    expect(new ObjectId().toHexString().length).toBe(24);
  });
});
