import {
  resetBillingWriteLockForTests,
  setBillingWriteLock,
} from "@web/billing/billing-write-lock";
import {
  blockAwaitingCheckoutEventWrite,
  consumeTrialStepTrigger,
  requestTrialStep,
  resetTrialStepRequestForTests,
} from "@web/billing/trial-step-request";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const openStartTrialStepModal = mock((_options?: { replace?: boolean }) =>
  Promise.resolve(),
);
mock.module("@web/components/AuthModal/auth-modal-runtime", () => ({
  openStartTrialStepModal: (options?: { replace?: boolean }) =>
    openStartTrialStepModal(options),
  registerOpenStartTrialStep: () => {},
  resetOpenStartTrialStepForTests: () => {},
}));

const trackModule = await import("@web/auth/posthog/track");

describe("requestTrialStep", () => {
  const track = spyOn(trackModule, "track");

  beforeEach(() => {
    openStartTrialStepModal.mockClear();
    track.mockClear();
    resetBillingWriteLockForTests();
    resetTrialStepRequestForTests();
  });

  afterEach(() => {
    resetBillingWriteLockForTests();
    resetTrialStepRequestForTests();
  });

  it("opens the trial modal and tracks write vs banner", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

    const opened = await requestTrialStep({ trigger: "banner" });

    expect(opened).toBe(true);
    expect(openStartTrialStepModal).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("trial_gate_triggered", {
      source: "banner",
    });
    expect(track).toHaveBeenCalledWith("billing_gate_shown", {
      status: "awaiting_checkout",
      surface: "explore_banner",
    });
    expect(consumeTrialStepTrigger()).toBe("banner");
  });

  it("tracks event_action for write attempts", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

    await requestTrialStep({ trigger: "write", eventAction: "replace" });

    expect(track).toHaveBeenCalledWith("trial_gate_triggered", {
      source: "write",
      event_action: "replace",
    });
    expect(consumeTrialStepTrigger()).toBe("write");
  });

  it("no-ops for expired read-only accounts", async () => {
    setBillingWriteLock({ locked: true, status: "expired" });

    const opened = await requestTrialStep({
      trigger: "write",
      eventAction: "create",
    });

    expect(opened).toBe(false);
    expect(openStartTrialStepModal).not.toHaveBeenCalled();
  });

  it("opens when the server refused a write before the write lock synced", async () => {
    const opened = await requestTrialStep({
      trigger: "write",
      eventAction: "create",
      serverBillingRequired: true,
    });

    expect(opened).toBe(true);
    expect(openStartTrialStepModal).toHaveBeenCalledTimes(1);
  });
});

describe("blockAwaitingCheckoutEventWrite", () => {
  const track = spyOn(trackModule, "track");

  beforeEach(() => {
    openStartTrialStepModal.mockClear();
    track.mockClear();
    resetBillingWriteLockForTests();
    resetTrialStepRequestForTests();
  });

  afterEach(() => {
    resetBillingWriteLockForTests();
    resetTrialStepRequestForTests();
  });

  it("blocks create and opens the trial step with event_action", () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

    expect(blockAwaitingCheckoutEventWrite("create")).toBe(true);
    expect(openStartTrialStepModal).toHaveBeenCalledTimes(1);
    expect(openStartTrialStepModal).toHaveBeenCalledWith({ replace: true });
    expect(track).toHaveBeenCalledWith("trial_gate_triggered", {
      source: "write",
      event_action: "create",
    });
  });

  it("does not block when billing is open", () => {
    expect(blockAwaitingCheckoutEventWrite("create")).toBe(false);
    expect(openStartTrialStepModal).not.toHaveBeenCalled();
  });
});
