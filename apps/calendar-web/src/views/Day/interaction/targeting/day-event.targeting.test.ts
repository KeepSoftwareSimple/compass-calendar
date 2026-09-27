import {
  dayEventRegistry,
  dayEventTargeting,
} from "@web/grid/interaction/view-event-registry";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  dayEventRegistry.clear();
  document.body.innerHTML = "";
});

const addEventButton = ({
  eventId,
  eventType = "timed",
  isVisible = true,
}: {
  eventId?: string;
  eventType?: "all-day" | "timed";
  isVisible?: boolean;
}) => {
  const button = document.createElement("button");
  if (isVisible) {
    Object.defineProperty(button, "offsetParent", {
      configurable: true,
      get: () => document.body,
    });
  }
  document.body.appendChild(button);

  if (eventId) {
    dayEventRegistry.register({
      element: button,
      eventId,
      eventType,
    });
  }

  return button;
};

describe("dayGridEventTargeting", () => {
  it("prefers the focused calendar event", () => {
    addEventButton({ eventId: "first" });
    const focused = addEventButton({
      eventId: "focused",
      eventType: "all-day",
    });
    focused.focus();

    expect(dayEventTargeting.getFocusedGridEventTarget()).toMatchObject({
      element: focused,
      eventId: "focused",
      eventType: "all-day",
    });
  });

  it("falls back to the first visible registered event", () => {
    addEventButton({});
    addEventButton({ eventId: "hidden", isVisible: false });
    const firstVisible = addEventButton({ eventId: "visible" });

    expect(dayEventTargeting.getFirstNavigableGridEventTarget()).toMatchObject({
      element: firstVisible,
      eventId: "visible",
      eventType: "timed",
    });
  });

  it("focuses a returned calendar target", () => {
    const button = addEventButton({ eventId: "target" });
    const target = dayEventTargeting.getFirstNavigableGridEventTarget();

    if (!target) throw new Error("expected target");
    dayEventTargeting.focusGridEventTarget(target);

    expect(document.activeElement).toBe(button);
  });

  it("lists every visible registered event", () => {
    addEventButton({ eventId: "hidden", isVisible: false });
    const first = addEventButton({ eventId: "first" });
    const second = addEventButton({ eventId: "second" });

    expect(dayEventTargeting.listNavigableGridEventTargets()).toEqual([
      expect.objectContaining({ element: first, eventId: "first" }),
      expect.objectContaining({ element: second, eventId: "second" }),
    ]);
  });
});
