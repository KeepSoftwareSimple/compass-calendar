import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import * as Track from "@web/auth/posthog/track";
import {
  billingPreviewActions,
  initialBillingPreviewState,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import {
  initialCheckoutPanelState,
  selectCheckoutPanelOpen,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { ShortcutUpgradeToast } from "@web/billing/ShortcutUpgradeToast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { getShortcutHint } from "@web/shortcuts/tips/shortcut-tips.data";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

describe("ShortcutUpgradeToast", () => {
  const { port, mocks } = createTestToastPort();

  afterEach(() => {
    HotkeyManager.resetInstance();
    useBillingPreviewStore.setState(initialBillingPreviewState);
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
  });

  it("opens embedded checkout from the CTA and dismisses the toast", async () => {
    registerToastPort(port);
    billingPreviewActions.enter();
    const track = spyOn(Track, "track");
    const user = userEvent.setup();
    render(
      <HotkeysProvider>
        <ShortcutUpgradeToast
          toastId="shortcut-upgrade-toast"
          title="Unlock event editing shortcuts with Premium. Upgrade in 30 seconds."
          ctaLabel="Start trial"
          checkoutSource={{
            kind: "shortcut_prompt",
            featureArea: "event_editing",
          }}
        />
      </HotkeysProvider>,
    );

    expect(
      screen.getByText(
        "Unlock event editing shortcuts with Premium. Upgrade in 30 seconds.",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Start trial" })).getByText(
        "S",
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Start trial" }));

    expect(track).toHaveBeenCalledWith("billing_gate_cta_clicked", {
      cta: "shortcut_prompt",
    });
    expect(selectCheckoutPanelOpen(useCheckoutPanelStore.getState())).toBe(
      true,
    );
    expect(useBillingPreviewStore.getState().isPreviewing).toBe(false);
    expect(useCheckoutPanelStore.getState().source).toEqual({
      kind: "shortcut_prompt",
      featureArea: "event_editing",
    });
    expect(mocks.dismiss).toHaveBeenCalledWith("shortcut-upgrade-toast");
    track.mockRestore();
  });

  it("names the exact key that was pressed and hands its action to Checkout", async () => {
    registerToastPort(port);
    const track = spyOn(Track, "track");
    const user = userEvent.setup();
    render(
      <HotkeysProvider>
        <ShortcutUpgradeToast
          toastId="shortcut-upgrade-toast"
          parts={getShortcutHint("nudge").parts}
          title="Premium unlocks it, so you can reschedule in seconds without touching the mouse."
          ctaLabel="Start trial"
          checkoutSource={{
            kind: "shortcut_prompt",
            featureArea: "event_editing",
            actionId: "event.move",
          }}
        />
      </HotkeysProvider>,
    );

    expect(
      screen.getByText("Shift and an arrow moves the event"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Premium unlocks it, so you can reschedule in seconds without touching the mouse.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start trial" }));

    expect(track).toHaveBeenCalledWith("billing_gate_cta_clicked", {
      cta: "shortcut_prompt",
      action_id: "event.move",
    });
    expect(useCheckoutPanelStore.getState().source).toEqual({
      kind: "shortcut_prompt",
      featureArea: "event_editing",
      actionId: "event.move",
    });
    track.mockRestore();
  });
});
