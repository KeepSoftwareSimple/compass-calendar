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
import { afterEach, describe, expect, it, mock } from "bun:test";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", Track, { track });

const { TrialCardBanner } = await import("@web/billing/TrialCardBanner");

const renderBanner = (daysLeft = 3) =>
  render(
    <HotkeysProvider>
      <TrialCardBanner daysLeft={daysLeft} />
    </HotkeysProvider>,
  );

describe("TrialCardBanner", () => {
  afterEach(() => {
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
    track.mockClear();
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

  it("hides for the rest of the session when dismissed", async () => {
    renderBanner(2);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(
      screen.queryByText(
        "Your trial ends in 2 days. Add a card to keep creating events.",
      ),
    ).not.toBeInTheDocument();
    expect(useCheckoutPanelStore.getState().isOpen).toBe(false);
  });
});
