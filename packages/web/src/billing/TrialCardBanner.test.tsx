import "@testing-library/jest-dom";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as Track from "@web/auth/posthog/track";
import {
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", Track, { track });

const { TrialCardBanner } = await import("@web/billing/TrialCardBanner");

const TRIAL_END = "2026-09-25T00:00:00.000Z";
const OTHER_TRIAL_END = "2026-10-01T00:00:00.000Z";

const renderBanner = (daysLeft = 3, trialEndsAt: string = TRIAL_END) =>
  render(
    <HotkeysProvider>
      <TrialCardBanner daysLeft={daysLeft} trialEndsAt={trialEndsAt} />
    </HotkeysProvider>,
  );

describe("TrialCardBanner", () => {
  beforeEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.TRIAL_CARD_BANNER_DISMISSED_FOR);
  });

  afterEach(() => {
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
    track.mockClear();
    persistentBrowserStore.remove(STORAGE_KEYS.TRIAL_CARD_BANNER_DISMISSED_FOR);
  });

  it("opens checkout from the Add a card action and records shown and clicked", async () => {
    renderBanner(3);

    expect(
      screen.getByText(
        "Your trial ends in 3 days. Add a card to keep creating events.",
      ),
    ).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("billing_gate_shown", {
      status: "trial_ending",
    });

    await userEvent.click(screen.getByRole("button", { name: "Add a card" }));

    expect(track).toHaveBeenCalledWith("billing_gate_cta_clicked", {
      cta: "trial_banner_checkout",
    });
    expect(useCheckoutPanelStore.getState()).toEqual({
      isOpen: true,
      source: { kind: "trial_banner" },
    });
  });

  it("stays hidden after dismiss and remount for the same trial end", async () => {
    const { unmount } = renderBanner(2);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(
      screen.queryByText(
        "Your trial ends in 2 days. Add a card to keep creating events.",
      ),
    ).not.toBeInTheDocument();
    expect(useCheckoutPanelStore.getState().isOpen).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.TRIAL_CARD_BANNER_DISMISSED_FOR),
    ).toBe(TRIAL_END);

    unmount();
    renderBanner(2);

    expect(
      screen.queryByText(
        "Your trial ends in 2 days. Add a card to keep creating events.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows again when the trial end date changes", async () => {
    const { unmount } = renderBanner(2);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    unmount();

    renderBanner(2, OTHER_TRIAL_END);

    expect(
      screen.getByText(
        "Your trial ends in 2 days. Add a card to keep creating events.",
      ),
    ).toBeInTheDocument();
  });
});
