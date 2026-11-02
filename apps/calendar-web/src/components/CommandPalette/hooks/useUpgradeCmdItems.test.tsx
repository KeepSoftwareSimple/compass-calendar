import { renderHook } from "@testing-library/react";
import {
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { type AppAccess } from "@web/billing/useAppAccess";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
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
const realIsAppAccessPending = actualAppAccess.useIsAppAccessPending;
const realUpgradeConfirmation =
  actualUpgradeConfirmation.useUpgradeConfirmation;
let isMocked = true;
let access: AppAccess = { kind: "open" };
let isAccessPending = false;
const openUpgradeConfirmation = mock(() => {});

mock.module("@web/billing/useAppAccess", () => ({
  ...actualAppAccess,
  useAppAccess: (...args: Parameters<typeof realAppAccess>) =>
    isMocked ? access : realAppAccess(...args),
  useIsAppAccessPending: () =>
    isMocked ? isAccessPending : realIsAppAccessPending(),
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
    isAccessPending = false;
    persistentBrowserStore.remove(STORAGE_KEYS.LAST_SEEN_TRIALING);
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

  it("holds a disabled Subscribe now while the plan loads after a trial", () => {
    persistentBrowserStore.set(STORAGE_KEYS.LAST_SEEN_TRIALING, "true");
    isAccessPending = true;
    const { result } = renderHook(() => useUpgradeCmdItems());

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      id: "subscribe-now-pending",
      label: "Subscribe now",
      disabled: true,
    });
  });

  it("holds no slot while loading when this browser never saw a trial", () => {
    isAccessPending = true;
    const { result } = renderHook(() => useUpgradeCmdItems());
    expect(result.current).toEqual([]);
  });

  it("remembers the trial once the plan loads", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: "2026-09-03T00:00:00.000Z",
    };
    renderHook(() => useUpgradeCmdItems());
    expect(persistentBrowserStore.get(STORAGE_KEYS.LAST_SEEN_TRIALING)).toBe(
      "true",
    );

    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    renderHook(() => useUpgradeCmdItems());
    expect(persistentBrowserStore.get(STORAGE_KEYS.LAST_SEEN_TRIALING)).toBe(
      null,
    );
  });

  it("offers nothing when billing is not enforced", () => {
    const { result } = renderHook(() => useUpgradeCmdItems());
    expect(result.current).toEqual([]);
  });
});
