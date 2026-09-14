import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { type AppAccess } from "@web/billing/useAppAccess";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const actualUseAppAccess = (await import("@web/billing/useAppAccess"))
  .useAppAccess;
let isAppAccessMocked = true;
let access: AppAccess = { kind: "open" };

mock.module("@web/billing/useAppAccess", () => ({
  useAppAccess: (...args: Parameters<typeof actualUseAppAccess>) =>
    isAppAccessMocked ? access : actualUseAppAccess(...args),
}));

// mock.module is process-wide: spread the real module and delegate back once
// this file is done, or every later suite loses the other exports.
const actualUpgradeConfirmation = {
  ...(await import(
    "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation"
  )),
};
// Bound to a bare identifier so the delegate call is not a `use*` member
// expression, which the rules-of-hooks lint reads as a conditional hook.
const realUpgradeConfirmation =
  actualUpgradeConfirmation.useUpgradeConfirmation;
let isUpgradeConfirmationMocked = true;
const openUpgradeConfirmation = mock(() => {});

mock.module(
  "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation",
  () => ({
    ...actualUpgradeConfirmation,
    useUpgradeConfirmation: () =>
      isUpgradeConfirmationMocked
        ? {
            isOpen: false,
            openUpgradeConfirmation,
            closeUpgradeConfirmation: () => {},
          }
        : realUpgradeConfirmation(),
  }),
);

const { TrialBadge } = await import("@web/billing/TrialBadge");

afterAll(() => {
  isAppAccessMocked = false;
  isUpgradeConfirmationMocked = false;
});

const trialEndingIn = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe("TrialBadge", () => {
  beforeEach(() => {
    access = { kind: "open" };
    openUpgradeConfirmation.mockClear();
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
  });

  it("shows the days remaining while trialing", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: trialEndingIn(5),
    };
    render(<TrialBadge />);

    const badge = screen.getByRole("button", {
      name: "5 days left in your trial. Subscribe now.",
    });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("5d");
  });

  it("names the last day rather than showing 0", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: trialEndingIn(-1),
    };
    render(<TrialBadge />);

    expect(
      screen.getByRole("button", {
        name: "Last day of your trial. Subscribe now.",
      }),
    ).toHaveTextContent("Last day");
  });

  it("says the trial will not renew when a cancel is scheduled", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: trialEndingIn(5),
      cancelAtPeriodEnd: true,
    };
    render(<TrialBadge />);

    const badge = screen.getByRole("button", {
      name: "5 days left in your trial. It will not renew. Subscribe now.",
    });
    expect(badge).toHaveTextContent("5d");
  });

  it("carries no tabindex, so Mod+2 still lands on the day grid", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: trialEndingIn(3),
    };
    render(<TrialBadge />);

    expect(screen.getByRole("button")).not.toHaveAttribute("tabindex");
  });

  it("opens Checkout when a local trial needs a payment method", async () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: trialEndingIn(3),
      needsPaymentMethod: true,
    };
    render(<TrialBadge />);

    await userEvent.click(screen.getByRole("button"));
    expect(openUpgradeConfirmation).not.toHaveBeenCalled();
    expect(useCheckoutPanelStore.getState().isOpen).toBe(true);
  });

  it("opens the upgrade confirmation when activated", async () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: trialEndingIn(3),
    };
    render(<TrialBadge />);

    await userEvent.click(screen.getByRole("button"));
    expect(openUpgradeConfirmation).toHaveBeenCalledTimes(1);
  });

  it("renders nothing for a paying subscriber", () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    const { container } = render(<TrialBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when billing is not enforced", () => {
    access = { kind: "open" };
    const { container } = render(<TrialBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an account awaiting checkout", () => {
    access = {
      kind: "server",
      status: "awaiting_checkout",
      isReadOnly: true,
      trialEndsAt: null,
    };
    const { container } = render(<TrialBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
