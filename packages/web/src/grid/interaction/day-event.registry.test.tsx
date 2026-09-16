import { render } from "@testing-library/react";
import {
  createDayEventRegistry,
  DAY_INTERACTION_EVENT_ID_ATTRIBUTE,
  DAY_INTERACTION_EVENT_TYPE_ATTRIBUTE,
  type DayInteractionEventType,
  dayEventRegistry,
  getDayInteractionTargetAttributes,
  useDayEventRegistrationRef,
} from "@web/grid/interaction/view-event-registry";
import { afterEach, describe, expect, it } from "bun:test";

const RegistrationHarness = ({
  eventId = "event-1",
  eventType = "timed",
  isEnabled = true,
}: {
  eventId?: string;
  eventType?: DayInteractionEventType;
  isEnabled?: boolean;
}) => {
  const ref = useDayEventRegistrationRef({
    eventId,
    eventType,
    isEnabled,
  });

  return (
    <div
      {...getDayInteractionTargetAttributes({ eventId, eventType })}
      ref={ref}
    >
      event
    </div>
  );
};

afterEach(() => {
  dayEventRegistry.clear();
  document.body.innerHTML = "";
});

describe("dayEventRegistry", () => {
  it("keeps Day event attributes after registry extraction", () => {
    const attributes = getDayInteractionTargetAttributes({
      eventId: "event-1",
      eventType: "timed",
    });

    expect(attributes).toEqual({
      "data-day-interaction-event-id": "event-1",
      "data-day-interaction-event-type": "timed",
    });
  });

  it("registers and unregisters enabled event elements", () => {
    const { container, unmount } = render(<RegistrationHarness />);
    const element = container.firstElementChild as HTMLElement;

    expect(dayEventRegistry.resolve("event-1", "timed")).toBe(element);
    expect(element).toHaveAttribute(
      DAY_INTERACTION_EVENT_ID_ATTRIBUTE,
      "event-1",
    );
    expect(element).toHaveAttribute(
      DAY_INTERACTION_EVENT_TYPE_ATTRIBUTE,
      "timed",
    );

    unmount();

    expect(dayEventRegistry.resolve("event-1", "timed")).toBeNull();
  });

  it("does not register disabled event elements", () => {
    render(<RegistrationHarness isEnabled={false} />);

    expect(dayEventRegistry.resolve("event-1", "timed")).toBeNull();
  });

  it("unregisters the old element when a render swaps event ids", () => {
    const { rerender } = render(<RegistrationHarness eventId="event-1" />);

    expect(dayEventRegistry.resolve("event-1", "timed")).toBeTruthy();

    rerender(<RegistrationHarness eventId="event-2" />);

    expect(dayEventRegistry.resolve("event-1", "timed")).toBeNull();
    expect(dayEventRegistry.resolve("event-2", "timed")).toBeTruthy();
  });

  it("rejects stale or mismatched registrations", () => {
    const registry = createDayEventRegistry();
    const staleElement = document.createElement("div");

    document.body.append(staleElement);
    registry.register({
      element: staleElement,
      eventId: "event-1",
      eventType: "timed",
    });
    staleElement.remove();

    expect(registry.resolve("event-1", "timed")).toBeNull();

    const mismatchedElement = document.createElement("div");

    document.body.append(mismatchedElement);
    registry.register({
      element: mismatchedElement,
      eventId: "event-2",
      eventType: "timed",
    });
    mismatchedElement.setAttribute(
      DAY_INTERACTION_EVENT_ID_ATTRIBUTE,
      "other-event",
    );

    expect(registry.resolve("event-2", "timed")).toBeNull();
  });

  it("resolves a registered event from child pointer targets", () => {
    const registry = createDayEventRegistry();
    const element = document.createElement("div");
    const child = document.createElement("span");

    element.append(child);
    document.body.append(element);
    registry.register({
      element,
      eventId: "event-1",
      eventType: "timed",
    });

    expect(registry.resolveFromTarget(child)).toEqual({
      element,
      eventId: "event-1",
      eventType: "timed",
    });
  });
});
