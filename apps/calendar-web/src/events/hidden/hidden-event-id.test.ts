import {
  EMPTY_HIDDEN_EVENT_IDS,
  isEventIdHidden,
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
