import { renderHook } from "@testing-library/react";
import {
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { type AppAccess } from "@web/billing/useAppAccess";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

// mock.module is process-wide: spread the real modules and delegate back once
// this file is done, or every later suite loses the other exports.
const actualAppAccess = { ...(await import("@web/billing/useAppAccess")) };
const actualUpgradeConfirmation = {
  ...(await import(
    "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation"
  )),
};
// Bound to bare identifiers so the delegate calls are not `use*` member
// expressions, which the rules-of-hooks lint reads as conditional hooks.
const realAppAccess = actualAppAccess.useAppAccess;
const realUpgradeConfirmation =
  actualUpgradeConfirmation.useUpgradeConfirmation;
let isMocked = true;
let access: AppAccess = { kind: "open" };
const openUpgradeConfirmation = mock(() => {});

mock.module("@web/billing/useAppAccess", () => ({
  ...actualAppAccess,
  useAppAccess: (...args: Parameters<typeof realAppAccess>) =>
    isMocked ? access : realAppAccess(...args),
}));

mock.module(
  "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation",
  () => ({
    ...actualUpgradeConfirmation,
    useUpgradeConfirmation: () =>
      isMocked
        ? {
            isOpen: false,
            openUpgradeConfirmation,
            closeUpgradeConfirmation: () => {},
          }
        : realUpgradeConfirmation(),
  }),
);

const { useUpgradeCmdItems } = await import(
  "@web/components/CommandPalette/hooks/useUpgradeCmdItems"
);

afterAll(() => {
  isMocked = false;
});

describe("useUpgradeCmdItems", () => {
  beforeEach(() => {
    access = { kind: "open" };
    openUpgradeConfirmation.mockClear();
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
  });

  it("offers Subscribe now while trialing", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: "2026-09-03T00:00:00.000Z",
    };
    const { result } = renderHook(() => useUpgradeCmdItems());

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.label).toBe("Subscribe now");
    result.current[0]?.onClick?.();
    expect(openUpgradeConfirmation).toHaveBeenCalledTimes(1);
  });

  it("opens Checkout for a local trial that still needs a card", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: "2026-09-03T00:00:00.000Z",
      needsPaymentMethod: true,
    };
    const { result } = renderHook(() => useUpgradeCmdItems());

    result.current[0]?.onClick?.();
    expect(openUpgradeConfirmation).not.toHaveBeenCalled();
    expect(useCheckoutPanelStore.getState().isOpen).toBe(true);
  });

  it("offers nothing to a paying subscriber", () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    const { result } = renderHook(() => useUpgradeCmdItems());
    expect(result.current).toEqual([]);
  });

  it("offers nothing when billing is not enforced", () => {
    const { result } = renderHook(() => useUpgradeCmdItems());
    expect(result.current).toEqual([]);
  });
});
