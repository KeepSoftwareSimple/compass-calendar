import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  checkoutCelebrationActions,
  initialCheckoutCelebrationState,
  useCheckoutCelebrationStore,
} from "@web/billing/checkout-celebration.store";
import { type AppAccess } from "@web/billing/useAppAccess";
import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";

const actualUseAppAccess = (await import("@web/billing/useAppAccess"))
  .useAppAccess;
let isAppAccessMocked = true;
let access: AppAccess = { kind: "open" };

mock.module("@web/billing/useAppAccess", () => ({
  useAppAccess: (...args: Parameters<typeof actualUseAppAccess>) =>
    isAppAccessMocked ? access : actualUseAppAccess(...args),
}));

const { CheckoutCelebrationModal } = await import("./CheckoutCelebrationModal");

const server = (
  status: Extract<AppAccess, { kind: "server" }>["status"],
  trialEndsAt: string | null = null,
): AppAccess => ({ kind: "server", status, isReadOnly: false, trialEndsAt });

afterAll(() => {
  isAppAccessMocked = false;
});

describe("CheckoutCelebrationModal", () => {
  afterEach(() => {
    access = { kind: "open" };
    useCheckoutCelebrationStore.setState(initialCheckoutCelebrationState);
  });

  it("stays out of the way until a checkout returns", () => {
    render(<CheckoutCelebrationModal />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("celebrates the trial a checkout just started", () => {
    access = server("trialing", "2026-09-03T00:00:00.000Z");
    checkoutCelebrationActions.celebrate();
    render(<CheckoutCelebrationModal />);

    expect(
      screen.getByRole("dialog", { name: "You're aboard!" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your 7-day trial has started. Full access, nothing held back.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /pixel pirate/i }),
    ).toBeInTheDocument();
  });

  it("names the membership once the subscription is active", () => {
    access = server("active");
    checkoutCelebrationActions.celebrate();
    render(<CheckoutCelebrationModal />);

    expect(
      screen.getByText("You're a Compass Premium member."),
    ).toBeInTheDocument();
  });

  // The webhook can land after the redirect, so the modal must say something
  // true rather than claim a plan it cannot yet see.
  it("holds a neutral line while the webhook is still in flight", () => {
    access = server("awaiting_checkout");
    checkoutCelebrationActions.celebrate();
    render(<CheckoutCelebrationModal />);

    expect(
      screen.getByText("Setting up your subscription..."),
    ).toBeInTheDocument();
  });

  // The button advertises an Enter hint, and Escape is the app's universal
  // step-back; both must really close it, not just the click.
  it("closes on Enter from the button it seats focus on", async () => {
    access = server("trialing", "2026-09-03T00:00:00.000Z");
    checkoutCelebrationActions.celebrate();
    const user = userEvent.setup();
    render(<CheckoutCelebrationModal />);

    expect(
      screen.getByRole("button", { name: /Start planning/ }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(useCheckoutCelebrationStore.getState().isCelebrating).toBe(false);
    });
  });

  it("closes on Escape", async () => {
    access = server("trialing", "2026-09-03T00:00:00.000Z");
    checkoutCelebrationActions.celebrate();
    const user = userEvent.setup();
    render(<CheckoutCelebrationModal />);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(useCheckoutCelebrationStore.getState().isCelebrating).toBe(false);
    });
  });

  it("clears the celebration when dismissed", async () => {
    access = server("trialing", "2026-09-03T00:00:00.000Z");
    checkoutCelebrationActions.celebrate();
    const user = userEvent.setup();
    render(<CheckoutCelebrationModal />);

    await user.click(screen.getByRole("button", { name: /Start planning/ }));

    await waitFor(() => {
      expect(useCheckoutCelebrationStore.getState().isCelebrating).toBe(false);
    });
  });
});
