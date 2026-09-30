import "@testing-library/jest-dom";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { BillingApi } from "@web/api/billing.api";
import { useUpgradeConfirmation } from "@web/billing/UpgradeConfirmation/hooks/useUpgradeConfirmation";
import { UpgradeConfirmationProvider } from "@web/billing/UpgradeConfirmation/UpgradeConfirmationProvider";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import {
  initialSettingsState,
  selectIsSettingsOpen,
  selectSettingsPage,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

// Register a toast port rather than spying the toast utils: spyOn patches the
// shared module object, so calls here would leak into other suites' spies.
let toastMocks: ReturnType<typeof createTestToastPort>["mocks"];

function OpenButton() {
  const { openUpgradeConfirmation } = useUpgradeConfirmation();
  return (
    <button type="button" onClick={openUpgradeConfirmation}>
      open upgrade
    </button>
  );
}

const renderProvider = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <HotkeysProvider>
        <UpgradeConfirmationProvider>
          <OpenButton />
        </UpgradeConfirmationProvider>
      </HotkeysProvider>
    </QueryClientProvider>,
  );

const openDialog = async () => {
  renderProvider();
  await userEvent.click(screen.getByRole("button", { name: "open upgrade" }));
  return screen.getByRole("dialog", {
    name: "Start Premium now?",
  });
};

beforeEach(() => {
  const { port, mocks } = createTestToastPort();
  toastMocks = mocks;
  registerToastPort(port);
});

afterEach(() => {
  resetToastPort();
  useSettingsStore.setState(initialSettingsState, true);
});

describe("UpgradeConfirmationProvider", () => {
  it("does not name a price, since the price lives in Stripe", async () => {
    const dialog = await openDialog();
    expect(dialog.textContent).not.toMatch(/\$|\bUSD\b|\bmonth\b/);
    expect(dialog).toHaveTextContent("the card on file is charged today");
    expect(dialog).toHaveTextContent(
      "It does not charge you or end the trial.",
    );
  });

  it("ends the trial and confirms the subscription", async () => {
    const endTrial = spyOn(BillingApi, "endTrial").mockResolvedValue({
      subscriptionStatus: "active",
      trialEndsAt: null,
      isReadOnly: false,
      cancelAtPeriodEnd: false,
    });
    await openDialog();

    await userEvent.click(
      screen.getByRole("button", { name: /Start Premium/ }),
    );

    await waitFor(() => {
      expect(endTrial).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(toastMocks.toast).toHaveBeenCalledWith(
        "You're subscribed",
        expect.objectContaining({ toastId: "billing-subscribed" }),
      );
    });
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Start Premium now?" }),
    ).not.toBeInTheDocument();
    endTrial.mockRestore();
  });

  it("reports a declined card instead of a false success", async () => {
    const endTrial = spyOn(BillingApi, "endTrial").mockResolvedValue({
      subscriptionStatus: "past_due",
      trialEndsAt: null,
      isReadOnly: false,
      cancelAtPeriodEnd: false,
    });
    await openDialog();

    await userEvent.click(
      screen.getByRole("button", { name: /Start Premium/ }),
    );

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "We ended your trial, but the payment didn't go through. Check your card under Manage billing.",
        expect.anything(),
      );
    });
    expect(toastMocks.toast).not.toHaveBeenCalled();
    endTrial.mockRestore();
  });

  it("surfaces a failed request as an error toast", async () => {
    const endTrial = spyOn(BillingApi, "endTrial").mockRejectedValue(
      new Error("boom"),
    );
    await openDialog();

    await userEvent.click(
      screen.getByRole("button", { name: /Start Premium/ }),
    );

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Couldn't subscribe. Please try again.",
        expect.anything(),
      );
    });
    endTrial.mockRestore();
  });

  it("closes on cancel without calling Stripe", async () => {
    const endTrial = spyOn(BillingApi, "endTrial");
    await openDialog();

    await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(
      screen.queryByRole("dialog", { name: "Start Premium now?" }),
    ).not.toBeInTheDocument();
    expect(endTrial).not.toHaveBeenCalled();
    endTrial.mockRestore();
  });

  it("closes on Escape without calling Stripe", async () => {
    const endTrial = spyOn(BillingApi, "endTrial");
    await openDialog();

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Start Premium now?" }),
    ).not.toBeInTheDocument();
    expect(endTrial).not.toHaveBeenCalled();
    endTrial.mockRestore();
  });

  it("closes on Escape even when focus is outside the dialog", async () => {
    await openDialog();
    document.body.focus();

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Start Premium now?" }),
    ).not.toBeInTheDocument();
  });

  it("opens Settings on Billing from Manage billing", async () => {
    const endTrial = spyOn(BillingApi, "endTrial");
    await openDialog();

    await userEvent.click(
      screen.getByRole("button", { name: "Manage billing" }),
    );

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    expect(endTrial).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Start Premium now?" }),
    ).not.toBeInTheDocument();
    endTrial.mockRestore();
  });

  it("opens Settings on Billing with M and does not end the trial", async () => {
    const endTrial = spyOn(BillingApi, "endTrial");
    await openDialog();

    await userEvent.keyboard("m");

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    expect(endTrial).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Start Premium now?" }),
    ).not.toBeInTheDocument();
    endTrial.mockRestore();
  });

  it("activates Manage billing on hover then Enter instead of Start Premium", async () => {
    const endTrial = spyOn(BillingApi, "endTrial");
    await openDialog();

    const manage = screen.getByRole("button", { name: "Manage billing" });
    fireEvent.pointerEnter(manage, { pointerType: "mouse" });
    expect(manage).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    expect(endTrial).not.toHaveBeenCalled();
    endTrial.mockRestore();
  });
});
