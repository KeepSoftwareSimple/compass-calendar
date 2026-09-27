import { waitFor } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import {
  billingPreviewActions,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import {
  resetBillingWriteLockForTests,
  setBillingWriteLock,
} from "@web/billing/billing-write-lock";
import {
  promptShortcutUpgrade,
  resetShortcutUpgradePromptForTests,
} from "@web/billing/prompt-shortcut-upgrade";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { setAppLockReason } from "@web/shortcuts/app-lock";
import { getShortcutHint } from "@web/shortcuts/tips/shortcut-tips.data";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

const trackModule = await import("@web/auth/posthog/track");

describe("promptShortcutUpgrade", () => {
  const { port, mocks } = createTestToastPort();
  const track = spyOn(trackModule, "track");

  beforeEach(() => {
    registerToastPort(port);
    mocks.toast.mockClear();
    mocks.update.mockClear();
    track.mockClear();
    resetShortcutUpgradePromptForTests();
    resetBillingWriteLockForTests();
    billingPreviewActions.exit();
  });

  afterEach(() => {
    resetShortcutUpgradePromptForTests();
    resetBillingWriteLockForTests();
    billingPreviewActions.exit();
  });

  it("no-ops when billing is not write-locked", () => {
    promptShortcutUpgrade({
      featureArea: "event_editing",
      actionId: "event.move",
      source: "keyboard",
    });

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("shows a contextual prompt and tracks both funnel events", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

    promptShortcutUpgrade({
      featureArea: "event_editing",
      actionId: "event.move",
      source: "keyboard",
    });

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });
    expect(track).toHaveBeenCalledWith("shortcut_upgrade_prompted", {
      feature_area: "event_editing",
      action_id: "event.move",
      source: "keyboard",
    });
    expect(track).toHaveBeenCalledWith("billing_gate_shown", {
      status: "awaiting_checkout",
      surface: "shortcut_prompt",
    });
    expect(useBillingPreviewStore.getState().isPreviewing).toBe(false);
  });

  it("replaces the billing gate with look-around when that lock owns the screen", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });
    setAppLockReason("billingGate", true);

    promptShortcutUpgrade({
      featureArea: "event_creation",
      actionId: "calendar.create_timed_event",
      source: "keyboard",
    });

    await waitFor(() => {
      expect(useBillingPreviewStore.getState().isPreviewing).toBe(true);
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });
    setAppLockReason("billingGate", false);
  });

  it("names the pressed key and its pitch when the caller knows the shortcut", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

    promptShortcutUpgrade({
      featureArea: "event_creation",
      actionId: "calendar.create_timed_event",
      hintId: "create-event",
      source: "keyboard",
    });

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });
    const [[element]] = mocks.toast.mock.calls as unknown as [
      [{ props: Record<string, unknown> }],
    ];
    expect(element.props).toMatchObject({
      parts: getShortcutHint("create-event").parts,
      title:
        "Premium unlocks it, so you can block time the moment you think of it.",
      ctaLabel: "Start trial",
      checkoutSource: {
        kind: "shortcut_prompt",
        featureArea: "event_creation",
        actionId: "calendar.create_timed_event",
      },
    });
  });

  it("falls back to feature-area copy without a key line when no shortcut is known", async () => {
    setBillingWriteLock({ locked: true, status: "expired" });

    promptShortcutUpgrade({
      featureArea: "event_creation",
      actionId: "calendar.create_timed_event",
      source: "command_palette",
    });

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });
    const [[element]] = mocks.toast.mock.calls as unknown as [
      [{ props: Record<string, unknown> }],
    ];
    expect(element.props.parts).toBeUndefined();
    expect(element.props).toMatchObject({
      title:
        "Unlock event creation shortcuts with Premium. Upgrade in 30 seconds.",
      ctaLabel: "Subscribe",
    });
  });

  it("deduplicates tracking for a rapid repeat of the same shortcut", async () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });

    promptShortcutUpgrade(
      {
        featureArea: "event_editing",
        actionId: "event.move",
        source: "keyboard",
      },
      100_000,
    );
    promptShortcutUpgrade(
      {
        featureArea: "event_editing",
        actionId: "event.move",
        source: "keyboard",
      },
      100_001,
    );

    expect(
      track.mock.calls.filter(([name]) => name === "shortcut_upgrade_prompted"),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledTimes(2);
    });
  });
});
