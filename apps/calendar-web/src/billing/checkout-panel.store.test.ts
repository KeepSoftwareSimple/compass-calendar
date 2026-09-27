import {
  checkoutPanelActions,
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { afterEach, describe, expect, it } from "bun:test";

describe("checkoutPanelActions", () => {
  afterEach(() => {
    useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
  });

  it("opens from the gate with no source", () => {
    checkoutPanelActions.open();

    expect(useCheckoutPanelStore.getState()).toEqual({
      isOpen: true,
      source: null,
    });
  });

  it("keeps the opener's source until Checkout closes", () => {
    const source = {
      kind: "shortcut_prompt" as const,
      featureArea: "event_creation" as const,
      actionId: "calendar.create_timed_event",
    };

    checkoutPanelActions.open(source);
    expect(useCheckoutPanelStore.getState()).toEqual({ isOpen: true, source });

    checkoutPanelActions.close();
    expect(useCheckoutPanelStore.getState()).toEqual(initialCheckoutPanelState);
  });
});
