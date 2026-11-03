import {
  EMPTY_HIDDEN_EVENT_IDS,
  isEventIdHidden,
  withoutHiddenEventId,
} from "@web/events/hidden/hidden-event-id";
import { describe, expect, it } from "bun:test";

describe("isEventIdHidden", () => {
  it("is false for a missing id or an empty set", () => {
    expect(isEventIdHidden(undefined, new Set(["evt-1"]))).toBe(false);
    expect(isEventIdHidden("evt-1", EMPTY_HIDDEN_EVENT_IDS)).toBe(false);
  });

  it("is true only when the id is in the set", () => {
    expect(isEventIdHidden("evt-1", new Set(["evt-1"]))).toBe(true);
    expect(isEventIdHidden("evt-2", new Set(["evt-1"]))).toBe(false);
  });
});

describe("withoutHiddenEventId", () => {
  it("returns the same set when the id is missing or not hidden", () => {
    const hidden = new Set(["evt-1"]);
    expect(withoutHiddenEventId(hidden, undefined)).toBe(hidden);
    expect(withoutHiddenEventId(hidden, "evt-2")).toBe(hidden);
  });

  it("returns a copy without the named id", () => {
    const hidden = new Set(["evt-1", "evt-2"]);
    expect(withoutHiddenEventId(hidden, "evt-1")).toEqual(new Set(["evt-2"]));
    expect(hidden.has("evt-1")).toBe(true);
  });
});
