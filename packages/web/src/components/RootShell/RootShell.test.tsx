import "@testing-library/jest-dom";
import { type QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { act, type ReactElement } from "react";
import { render, screen, waitFor } from "@web/__tests__/__mocks__/mock.render";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { createCompassQueryClient } from "@web/api/query-client";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { billingQueryKeys } from "@web/billing/billing.query";
import { resetBillingGateAttentionForTests } from "@web/billing/billing-gate-attention";
import {
  billingPreviewActions,
  initialBillingPreviewState,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import {
  checkoutCelebrationActions,
  initialCheckoutCelebrationState,
  useCheckoutCelebrationStore,
} from "@web/billing/checkout-celebration.store";
import {
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import {
  type EmbeddedCheckoutProps,
  setEmbeddedCheckoutForTests,
} from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { type AppAccess } from "@web/billing/useAppAccess";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { RootShell } from "@web/components/RootShell/RootShell";
import { useSettingsStore } from "@web/settings/settings.store";
import { pointerHintActions } from "@web/shortcuts/keyboard-only/pointer-hint.store";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const actualUseAppAccess = (await import("@web/billing/useAppAccess"))
  .useAppAccess;
let isAppAccessMocked = true;
let access: AppAccess = { kind: "open" };

mock.module("@web/billing/useAppAccess", () => ({
  useAppAccess: (...args: Parameters<typeof actualUseAppAccess>) =>
    isAppAccessMocked ? access : actualUseAppAccess(...args),
}));

const anonymousSession = {
  authenticated: false,
  setAuthenticated: () => {},
};

function FakeCheckout({ onComplete }: EmbeddedCheckoutProps) {
  return (
    <button type="button" onClick={onComplete}>
      Complete checkout
    </button>
  );
}

const renderShell = async (
  initialPath = "/",
  {
    anonymous = false,
    queryClient,
  }: { anonymous?: boolean; queryClient?: QueryClient } = {},
) => {
  const ui: ReactElement = anonymous ? (
    <SessionContext.Provider value={anonymousSession}>
      <RootShell />
    </SessionContext.Provider>
  ) : (
    <RootShell />
  );
  const router = createTestRouter(ui, {
    initialEntries: [initialPath],
  });
  render(<div />, { router, queryClient });
  await router.load();
  return router;
};

afterAll(() => {
  isAppAccessMocked = false;
});

const awaitingCheckout: AppAccess = {
  kind: "server",
  status: "awaiting_checkout",
  isReadOnly: true,
  trialEndsAt: null,
};

describe("RootShell billing gates", () => {
  afterEach(() => {
    access = { kind: "open" };
    useBillingPreviewStore.setState(initialBillingPreviewState);
    useCheckoutCelebrationStore.setState(initialCheckoutCelebrationState);
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
    useSettingsStore.setState({
      isSettingsOpen: false,
      settingsPage: "accounts",
    });
    resetBillingGateAttentionForTests();
  });

  it("never gates an anonymous visitor", async () => {
    await renderShell("/", { anonymous: true });

    expect(
      screen.queryByRole("dialog", { name: "Start your 7-day trial" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the billing gate when the account cannot write", async () => {
    access = awaitingCheckout;
    await renderShell();

    expect(
      screen.getByRole("dialog", { name: "Start your 7-day trial" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Manage billing" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Log out/ }),
    ).not.toBeInTheDocument();
  });

  it("swaps the gate for the read-only banner after Look around first", async () => {
    access = awaitingCheckout;
    await renderShell();

    await userEvent.click(
      screen.getByRole("button", { name: /Look around first/ }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Start your 7-day trial" }),
    ).not.toBeInTheDocument();
    // The click also pulses the keyboard hint (another status), so find the
    // banner by its copy rather than by role alone.
    expect(
      screen
        .getByText("You're looking around in read-only mode.")
        .closest("[role='status']"),
    ).not.toBeNull();
  });

  it("does not honor the look-around once the trial is spent", async () => {
    // A status change while previewing: the banner would pitch a trial that
    // is no longer on offer, so the gate has to reclaim the screen.
    billingPreviewActions.enter();
    access = { ...awaitingCheckout, status: "canceled" };
    await renderShell();

    expect(
      screen.getByRole("dialog", { name: "Subscribe to keep using Compass" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("brings the gate back when a write is refused", async () => {
    access = awaitingCheckout;
    await renderShell();

    await userEvent.click(
      screen.getByRole("button", { name: /Look around first/ }),
    );
    act(() => {
      billingPreviewActions.exit();
    });

    expect(
      screen.getByRole("dialog", { name: "Start your 7-day trial" }),
    ).toBeInTheDocument();
  });

  it("looks around with L without navigating to Life", async () => {
    access = awaitingCheckout;
    const router = await renderShell("/week");
    const user = userEvent.setup();

    await user.keyboard("l");

    expect(
      screen.queryByRole("dialog", { name: "Start your 7-day trial" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "You're looking around in read-only mode.",
    );
    expect(router.state.location.pathname).toBe("/week");
  });

  it("starts checkout with S from the billing gate", async () => {
    setEmbeddedCheckoutForTests(FakeCheckout);
    const queryClient = createCompassQueryClient();
    queryClient.setQueryData(billingQueryKeys.config, {
      google: { isConfigured: false },
      billing: {
        isConfigured: true,
        enforcement: true,
        trialLengthDays: 7,
        publishableKey: "pk_test_root",
      },
    });
    access = awaitingCheckout;
    await renderShell("/week", { queryClient });
    const user = userEvent.setup();

    await user.keyboard("s");

    expect(
      screen.getByRole("button", { name: "Complete checkout" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Start your 7-day trial" }),
    ).toBeInTheDocument();
  });

  it("dismisses the checkout celebration with Start planning", async () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: "2026-09-08T00:00:00.000Z",
    };
    checkoutCelebrationActions.celebrate();
    await renderShell("/week");

    const startPlanning = screen.getByRole("button", {
      name: "Start planning",
    });
    expect(startPlanning).toHaveAttribute("data-pointer-pass", "");
    await userEvent.click(startPlanning);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "You're aboard!" }),
      ).not.toBeInTheDocument();
    });
  });

  it("dismisses the checkout celebration with Enter", async () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: "2026-09-08T00:00:00.000Z",
    };
    checkoutCelebrationActions.celebrate();
    await renderShell("/week");
    const user = userEvent.setup();

    expect(
      screen.queryByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start planning" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "You're aboard!" }),
      ).not.toBeInTheDocument();
    });
  });
});

describe("RootShell calendar onboarding on /life", () => {
  beforeEach(() => {
    access = { kind: "open" };
  });

  it("does not show welcome or the practice card on /life, and does not burn flags", async () => {
    await renderShell("/life", { anonymous: true });

    expect(
      screen.queryByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", {
        name: "Create your first event",
      }),
    ).not.toBeInTheDocument();
    expect(persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBe(
      null,
    );
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).toBe(null);
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe(
      null,
    );
  });

  it("does not mount the keyboard-only pointer hint on /life", async () => {
    await renderShell("/life", { anonymous: true });

    act(() => {
      pointerHintActions.pulse({ actionId: "unknown" });
    });

    expect(
      screen.queryByText(/Compass works from the keyboard/i),
    ).not.toBeInTheDocument();
  });

  it("still shows welcome on /week for a first-time anonymous visitor", async () => {
    await renderShell("/week", { anonymous: true });

    expect(
      screen.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeInTheDocument();
  });

  it("hides an in-progress practice card on /life without dismissing it", async () => {
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_WELCOME, "true");
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "true");

    await renderShell("/life", { anonymous: true });

    expect(
      screen.queryByRole("complementary", {
        name: "Create your first event",
      }),
    ).not.toBeInTheDocument();
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe(
      null,
    );
  });

  it("shows the first-event prompt on /week after the showcase has been seen", async () => {
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_WELCOME, "true");
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "true");

    await renderShell("/week", { anonymous: true });

    expect(
      screen.getByRole("complementary", {
        name: "Create your first event",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Add your first event")).toBeInTheDocument();
  });
});
