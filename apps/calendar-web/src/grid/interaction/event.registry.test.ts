import { createEventRegistry } from "./event.registry";
import { afterEach, describe, expect, it } from "bun:test";

const EVENT_ID_ATTRIBUTE = "data-event-id";
const EVENT_TYPE_ATTRIBUTE = "data-event-type";
type EventType = "all-day" | "timed";

const createRegistry = () =>
  createEventRegistry<EventType>({
    eventIdAttribute: EVENT_ID_ATTRIBUTE,
    eventTypeAttribute: EVENT_TYPE_ATTRIBUTE,
    isEventType: (value): value is EventType =>
      value === "all-day" || value === "timed",
  });

const addEvent = () => {
  const element = document.createElement("button");
  const child = document.createElement("span");
  element.append(child);
  document.body.append(element);

  return { child, element };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("event registry", () => {
  it("resolves a registered event from one of its descendants", () => {
    const registry = createRegistry();
    const { child, element } = addEvent();

    registry.register({ element, eventId: "event-1", eventType: "timed" });

    expect(registry.resolveFromTarget(child)).toEqual({
      element,
      eventId: "event-1",
      eventType: "timed",
    });
  });

  it("drops registrations whose element left the document", () => {
    const registry = createRegistry();
    const { element } = addEvent();

    registry.register({ element, eventId: "event-1", eventType: "timed" });
    element.remove();

    expect(registry.resolve("event-1", "timed")).toBeNull();
  });

  it("does not let an old cleanup remove a replacement registration", () => {
    const registry = createRegistry();
    const first = addEvent().element;
    const second = addEvent().element;
    const unregisterFirst = registry.register({
      element: first,
      eventId: "event-1",
      eventType: "timed",
    });

    registry.register({
      element: second,
      eventId: "event-1",
      eventType: "timed",
    });
    unregisterFirst();

    expect(registry.resolve("event-1", "timed")).toBe(second);
  });
});
