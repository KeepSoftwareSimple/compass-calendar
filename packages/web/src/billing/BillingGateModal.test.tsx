import "@testing-library/jest-dom";
import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionContext } from "@web/auth/compass/session/session.context";
import * as Track from "@web/auth/posthog/track";
import { billingQueryKeys } from "@web/billing/billing.query";
import { resetBillingGateAttentionForTests } from "@web/billing/billing-gate-attention";
import {
  initialBillingPreviewState,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import {
  initialCheckoutCelebrationState,
  useCheckoutCelebrationStore,
} from "@web/billing/checkout-celebration.store";
import {
  checkoutPanelActions,
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import {
  type EmbeddedCheckoutProps,
  setEmbeddedCheckoutForTests,
} from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { BillingGateModal } from "./BillingGateModal";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

function FakeCheckout({ onComplete }: EmbeddedCheckoutProps) {
  return (
    <button type="button" onClick={onComplete}>
      Complete checkout
    </button>
  );
}

const GATE_CONFIG = {
  google: { isConfigured: false },
  billing: {
    isConfigured: true,
    enforcement: true,
    trialLengthDays: 7,
    publishableKey: "pk_test_gate",
  },
};

const renderGate = (status = "awaiting_checkout") => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(billingQueryKeys.config, GATE_CONFIG);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <SessionContext.Provider
          value={{ authenticated: true, setAuthenticated: () => {} }}
        >
          <BillingGateModal status={status} />
        </SessionContext.Provider>
      </HotkeysProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
};

describe("BillingGateModal", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    setEmbeddedCheckoutForTests(FakeCheckout);
  });

  afterEach(() => {
    useBillingPreviewStore.setState(initialBillingPreviewState);
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
    useCheckoutCelebrationStore.setState(initialCheckoutCelebrationState, true);
    resetBillingGateAttentionForTests();
  });

  it("opens embedded Checkout inside the gate from Start trial", async () => {
    const user = userEvent.setup();
    renderGate();

    await user.click(screen.getByRole("button", { name: "Start trial" }));

    expect(
      within(
        screen.getByRole("dialog", { name: "Start your 7-day trial" }),
      ).getByRole("button", { name: "Complete checkout" }),
    ).toBeInTheDocument();
  });

  it("shows shortcut keycaps and focuses Start trial", () => {
    renderGate();

    expect(screen.getByRole("button", { name: "Start trial" })).toHaveFocus();
    for (const [name, key] of [
      ["Start trial", "S"],
      ["Look around first", "L"],
    ] as const) {
      expect(
        within(screen.getByRole("button", { name })).getByText(key),
      ).toBeTruthy();
    }
    expect(
      screen.queryByRole("button", { name: "Export my data" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start trial" })).toHaveAttribute(
      "data-pointer-shortcut",
      "S",
    );
    expect(
      screen.getByRole("button", { name: "Look around first" }),
    ).toHaveAttribute("data-pointer-shortcut", "L");
  });

  it("does not mention a price on the start-trial or subscribe copy", () => {
    const { unmount } = renderGate();

    expect(
      screen.getByText(
        "Start a free 7-day trial to create and edit events, including keyboard shortcuts.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\$|\/month/i)).not.toBeInTheDocument();
    unmount();

    renderGate("canceled");
    expect(
      screen.getByText(
        "Your trial has ended. Subscribe to keep creating and editing events, including keyboard shortcuts.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\$|\/month/i)).not.toBeInTheDocument();
  });

  it("opens Checkout with S, returns to the buttons with Back, and does not dismiss on Escape", async () => {
    const user = userEvent.setup();
    renderGate();

    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "Start your 7-day trial" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Complete checkout" }),
    ).not.toBeInTheDocument();

    await user.keyboard("s");

    expect(
      screen.getByRole("button", { name: "Complete checkout" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(
      screen.getByRole("button", { name: "Start trial" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Complete checkout" }),
    ).not.toBeInTheDocument();
  });

  it("completes Checkout without leaving the gate", async () => {
    const track = spyOn(Track, "track");
    const user = userEvent.setup();
    const { queryClient } = renderGate();
    const invalidate = spyOn(queryClient, "invalidateQueries");

    await user.keyboard("s");
    await user.click(screen.getByRole("button", { name: "Complete checkout" }));

    expect(useCheckoutCelebrationStore.getState().isCelebrating).toBe(true);
    expect(track).toHaveBeenCalledWith("trial_converted", { source: "gate" });
    expect(track).not.toHaveBeenCalledWith(
      "billing_gate_shortcut_converted",
      expect.anything(),
    );
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["billing", "status"],
      });
    });
    track.mockRestore();
    invalidate.mockRestore();
  });

  it("attributes a conversion to the shortcut toast that opened Checkout", async () => {
    const track = spyOn(Track, "track");
    const user = userEvent.setup();
    renderGate();
    act(() => {
      checkoutPanelActions.open({
        kind: "shortcut_prompt",
        featureArea: "event_creation",
        actionId: "calendar.create_timed_event",
      });
    });

    await user.click(
      await screen.findByRole("button", { name: "Complete checkout" }),
    );

    const attribution = {
      source: "shortcut_prompt",
      feature_area: "event_creation",
      action_id: "calendar.create_timed_event",
    };
    expect(track).toHaveBeenCalledWith("trial_converted", attribution);
    expect(track).toHaveBeenCalledWith(
      "billing_gate_shortcut_converted",
      attribution,
    );
    expect(useCheckoutPanelStore.getState().source).toBeNull();
    track.mockRestore();
  });

  it("enters the read-only look-around with L", async () => {
    const user = userEvent.setup();
    renderGate();

    await user.keyboard("l");
    expect(useBillingPreviewStore.getState().isPreviewing).toBe(true);
  });

  it("offers no look-around once the trial is spent", () => {
    renderGate("canceled");

    expect(
      screen.queryByRole("button", { name: /Look around first/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Manage billing" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Subscribe" }),
    ).toBeInTheDocument();
  });

  it("traps Tab within the dialog", async () => {
    const user = userEvent.setup();
    renderGate();

    const start = screen.getByRole("button", { name: "Start trial" });
    const lookAround = screen.getByRole("button", {
      name: "Look around first",
    });
    expect(start).toHaveFocus();

    await user.tab({ shift: true });
    expect(lookAround).toHaveFocus();

    await user.tab();
    expect(start).toHaveFocus();
  });
});
