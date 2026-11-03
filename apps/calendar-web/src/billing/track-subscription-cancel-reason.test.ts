import * as Track from "@web/auth/posthog/track";
import { trackSubscriptionCancelReasonSubmitted } from "@web/billing/track-subscription-cancel-reason";
import { describe, expect, it, spyOn } from "bun:test";

describe("trackSubscriptionCancelReasonSubmitted", () => {
  it("sends reason and optional details for Other", () => {
    const track = spyOn(Track, "track");
    trackSubscriptionCancelReasonSubmitted({
      reason: "other",
      details: "  Needs Linux support  ",
    });
    expect(track).toHaveBeenCalledWith("subscription_cancel_reason_submitted", {
      reason: "other",
      details: "Needs Linux support",
    });
    track.mockRestore();
  });

  it("omits empty Other details", () => {
    const track = spyOn(Track, "track");
    trackSubscriptionCancelReasonSubmitted({ reason: "other", details: "   " });
    expect(track).toHaveBeenCalledWith("subscription_cancel_reason_submitted", {
      reason: "other",
    });
    track.mockRestore();
  });
});
