import "@testing-library/jest-dom";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type BillingSubscriptionResponse } from "@core/types/billing.types";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { BillingApi } from "@web/api/billing.api";
import * as Track from "@web/auth/posthog/track";
import {
  initialCardUpdateState,
  useCardUpdateStore,
} from "@web/billing/card-update.store";
import {
  type EmbeddedCheckoutProps,
  setEmbeddedCheckoutForTests,
} from "@web/billing/embedded-checkout/embedded-checkout.seam";
import { type AppAccess } from "@web/billing/useAppAccess";
import {
  BILLING_CARD_UPDATED_TOAST_ID,
  BILLING_PLAN_ENDS_TOAST_ID,
  BILLING_PLAN_RENEWS_TOAST_ID,
} from "@web/common/constants/toast.constants";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import {
  initialSettingsState,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { useSettingsShortcuts } from "@web/settings/useSettingsShortcuts";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const actualUseAppAccess = (await import("@web/billing/useAppAccess"))
  .useAppAccess;
let isAppAccessMocked = true;
let access: AppAccess = { kind: "open" };

mock.module("@web/billing/useAppAccess", () => ({
  useAppAccess: (...args: Parameters<typeof actualUseAppAccess>) =>
    isAppAccessMocked ? access : actualUseAppAccess(...args),
}));

const { PlanSection } = await import("./PlanSection");
const { billingQueryKeys } = await import("./billing.query");
const { formatBillingDate } = await import("./billing-display");

const PERIOD_END = "2099-06-15T12:00:00.000Z";
const PERIOD_END_LABEL = formatBillingDate(PERIOD_END);

const activeSummary = (
  overrides: Partial<BillingSubscriptionResponse> = {},
): BillingSubscriptionResponse => ({
  subscriptionStatus: "active",
  currentPeriodEnd: PERIOD_END,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
  price: { amount: 1200, currency: "usd", interval: "month" },
  paymentMethod: {
    brand: "visa",
    last4: "4242",
    expMonth: 12,
    expYear: 2099,
  },
  invoices: [
    {
      id: "in_paid",
      createdAt: "2099-05-15T12:00:00.000Z",
      amountPaid: 1200,
      currency: "usd",
      status: "paid",
      hostedInvoiceUrl: "https://invoice.stripe.com/paid",
    },
    {
      id: "in_trial",
      createdAt: "2099-04-15T12:00:00.000Z",
      amountPaid: 0,
      currency: "usd",
      status: "paid",
      hostedInvoiceUrl: "https://invoice.stripe.com/trial",
    },
  ],
  ...overrides,
});

function PlanHarness() {
  useSettingsShortcuts({
    enabled: true,
    hasBilling: true,
    hasBooking: false,
    page: "billing",
  });
  return <PlanSection showShortcuts />;
}

const renderPlan = async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(billingQueryKeys.config, {
    google: { isConfigured: false },
    billing: {
      isConfigured: true,
      enforcement: true,
      trialLengthDays: 7,
      publishableKey: "pk_test_card",
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <PlanHarness />
      </HotkeysProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.queryByText("Loading your plan")).not.toBeInTheDocument();
  });
  return { ...view, queryClient };
};

describe("PlanSection", () => {
  let toastMocks: ReturnType<typeof createTestToastPort>["mocks"];
  let getSubscription: ReturnType<typeof spyOn>;

  afterAll(() => {
    isAppAccessMocked = false;
  });

  beforeEach(() => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    settingsActions.openSettings("billing");
    const { port, mocks } = createTestToastPort();
    toastMocks = mocks;
    registerToastPort(port);
    getSubscription = spyOn(BillingApi, "getSubscription").mockResolvedValue(
      activeSummary(),
    );
  });

  afterEach(() => {
    cleanup();
    resetToastPort();
    getSubscription.mockRestore();
    useSettingsStore.setState(initialSettingsState, true);
    useCardUpdateStore.setState(initialCardUpdateState, true);
    setEmbeddedCheckoutForTests(null);
  });

  it("renders price, renewal, card, and receipts from the summary", async () => {
    await renderPlan();

    expect(screen.getByText("Premium")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("$12.00 per month")).toBeInTheDocument();
    });
    expect(screen.getByText(`Renews ${PERIOD_END_LABEL}`)).toBeInTheDocument();
    expect(
      screen.getByText("Visa ending in 4242, expires 12/99"),
    ).toBeInTheDocument();
    expect(screen.getByText("Receipts")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getAllByText("Paid")).toHaveLength(2);

    const receipt = screen.getAllByRole("link", { name: "Receipt" })[0];
    expect(receipt).toHaveAttribute("href", "https://invoice.stripe.com/paid");
    expect(receipt).toHaveAttribute("target", "_blank");
    expect(receipt).toHaveAttribute("rel", "noreferrer");

    const receipts = screen.getByRole("table", { name: "Receipts" });
    expect(
      within(receipts).getByRole("columnheader", { name: "Date" }),
    ).toBeInTheDocument();
    expect(
      within(receipts).getByRole("columnheader", { name: "Amount" }),
    ).toBeInTheDocument();
    expect(
      within(receipts).getByRole("columnheader", { name: "Status" }),
    ).toBeInTheDocument();
    expect(
      within(receipts).getByRole("columnheader", { name: "Receipt" }),
    ).toBeInTheDocument();
    expect(within(receipts).getAllByRole("row")).toHaveLength(3);
  });

  it("puts update card and cancel on one row, with cancel in red", async () => {
    await renderPlan();

    const update = await screen.findByRole("button", { name: "Update card" });
    const cancel = screen.getByRole("button", { name: "Cancel subscription" });
    expect(update.parentElement).toBe(cancel.parentElement);
    expect(cancel).toHaveClass("bg-error");
    expect(update).not.toHaveClass("bg-error");
  });

  it("opens confirm with C and cancels at period end", async () => {
    const user = userEvent.setup({ delay: null });
    const cancel = spyOn(BillingApi, "cancelSubscription").mockResolvedValue({
      subscriptionStatus: "active",
      trialEndsAt: null,
      isReadOnly: false,
      cancelAtPeriodEnd: true,
    });
    const track = spyOn(Track, "track");
    const { queryClient } = await renderPlan();
    const invalidate = spyOn(
      queryClient,
      "invalidateQueries",
    ).mockResolvedValue(undefined);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Cancel subscription" }),
      ).toBeInTheDocument();
    });

    await user.keyboard("c");

    const dialog = screen.getByRole("dialog", { name: "Cancel your plan?" });
    expect(dialog).toHaveTextContent(
      `Your plan stays active until ${PERIOD_END_LABEL}. You can resume any time before then.`,
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Cancel subscription" }),
    );

    await waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1);
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: billingQueryKeys.status,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: billingQueryKeys.subscription,
    });
    expect(track).toHaveBeenCalledWith("billing_cancel_scheduled");
    expect(toastMocks.toast).toHaveBeenCalledWith(
      `Your plan ends on ${PERIOD_END_LABEL}`,
      expect.objectContaining({ toastId: BILLING_PLAN_ENDS_TOAST_ID }),
    );

    cancel.mockRestore();
    track.mockRestore();
    invalidate.mockRestore();
  });

  it("resumes when cancel-at-period-end is already scheduled", async () => {
    getSubscription.mockResolvedValue(
      activeSummary({ cancelAtPeriodEnd: true }),
    );
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
      cancelAtPeriodEnd: true,
    };
    const user = userEvent.setup({ delay: null });
    const resume = spyOn(BillingApi, "resumeSubscription").mockResolvedValue({
      subscriptionStatus: "active",
      trialEndsAt: null,
      isReadOnly: false,
      cancelAtPeriodEnd: false,
    });
    const track = spyOn(Track, "track");

    await renderPlan();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Resume subscription" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Cancel subscription" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update card" }).parentElement,
    ).toBe(
      screen.getByRole("button", { name: "Resume subscription" }).parentElement,
    );
    expect(screen.getByText(`Ends ${PERIOD_END_LABEL}`)).toBeInTheDocument();

    await user.keyboard("r");

    await waitFor(() => {
      expect(resume).toHaveBeenCalledTimes(1);
    });
    expect(track).toHaveBeenCalledWith("billing_resumed");
    expect(toastMocks.toast).toHaveBeenCalledWith(
      "Your plan will renew",
      expect.objectContaining({ toastId: BILLING_PLAN_RENEWS_TOAST_ID }),
    );

    resume.mockRestore();
    track.mockRestore();
  });

  it("keeps the badge and shows the fallback toast when the summary fails", async () => {
    getSubscription.mockRejectedValue(new Error("network"));
    await renderPlan();

    expect(screen.getByText("Premium")).toBeInTheDocument();
    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Couldn't load billing details.",
        expect.anything(),
      );
    });
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });

  it("says no card on file when Stripe has no payment method", async () => {
    getSubscription.mockResolvedValue(activeSummary({ paymentMethod: null }));
    await renderPlan();

    await waitFor(() => {
      expect(screen.getByText("No card on file")).toBeInTheDocument();
    });
  });

  it("hides the receipts heading when the list is empty", async () => {
    getSubscription.mockResolvedValue(activeSummary({ invoices: [] }));
    await renderPlan();

    await waitFor(() => {
      expect(screen.getByText("$12.00 per month")).toBeInTheDocument();
    });
    expect(screen.queryByText("Receipts")).not.toBeInTheDocument();
  });

  it("tells a trialing subscriber they keep access until the trial ends", async () => {
    const trialEndsAt = PERIOD_END;
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt,
    };
    getSubscription.mockResolvedValue(
      activeSummary({
        subscriptionStatus: "trialing",
        trialEndsAt,
      }),
    );
    const user = userEvent.setup({ delay: null });
    await renderPlan();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Cancel subscription" }),
      ).toBeInTheDocument();
    });
    await user.keyboard("c");

    expect(
      screen.getByRole("dialog", { name: "Cancel your plan?" }),
    ).toHaveTextContent(
      `You keep access until the trial ends on ${PERIOD_END_LABEL}. You can resume any time before then.`,
    );
  });

  it("mounts the card form with U and unmounts it with Cancel", async () => {
    function FakeCheckout() {
      return <div>Fake card checkout</div>;
    }
    setEmbeddedCheckoutForTests(FakeCheckout);
    const user = userEvent.setup({ delay: null });
    await renderPlan();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Update card" }),
      ).toBeInTheDocument();
    });

    await user.keyboard("u");
    expect(screen.getByText("Fake card checkout")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update card" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Fake card checkout")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update card" })).toHaveFocus();
  });

  it("completes a card update, toasts, tracks, and polls the subscription", async () => {
    function FakeCheckout({ onComplete }: EmbeddedCheckoutProps) {
      return (
        <button type="button" onClick={onComplete}>
          Complete card update
        </button>
      );
    }
    setEmbeddedCheckoutForTests(FakeCheckout);
    const user = userEvent.setup({ delay: null });
    const track = spyOn(Track, "track");
    const { queryClient } = await renderPlan();
    const invalidate = spyOn(queryClient, "invalidateQueries");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Update card" }),
      ).toBeInTheDocument();
    });
    await user.keyboard("u");
    await user.click(
      screen.getByRole("button", { name: "Complete card update" }),
    );

    expect(track).toHaveBeenCalledWith("billing_card_update_completed");
    expect(toastMocks.toast).toHaveBeenCalledWith(
      "Card updated",
      expect.objectContaining({ toastId: BILLING_CARD_UPDATED_TOAST_ID }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: billingQueryKeys.subscription,
    });
    expect(screen.getByRole("button", { name: "Update card" })).toHaveFocus();

    track.mockRestore();
    invalidate.mockRestore();
  });
});
