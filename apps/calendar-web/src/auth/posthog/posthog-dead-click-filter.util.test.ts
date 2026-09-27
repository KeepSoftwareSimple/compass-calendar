import { type CaptureResult } from "posthog-js";
import { filterPosthogDeadClick } from "./posthog-dead-click-filter.util";
import { describe, expect, it } from "bun:test";

const CLICK_AT = 1_755_000_000_000;

const deadClickEvent = (
  properties: Record<string, unknown>,
  event = "$dead_click",
): CaptureResult =>
  ({
    uuid: "test-uuid",
    event,
    properties: {
      [`${event}_event_timestamp`]: CLICK_AT,
      ...properties,
    },
  }) as CaptureResult;

describe("filterPosthogDeadClick", () => {
  it("passes through non-dead-gesture events", () => {
    const event = {
      uuid: "1",
      event: "$rageclick",
      properties: { $dead_click_last_mutation_timestamp: CLICK_AT - 1 },
    } as CaptureResult;
    expect(filterPosthogDeadClick(event)).toBe(event);
  });

  it("passes through a null event", () => {
    expect(filterPosthogDeadClick(null)).toBeNull();
  });

  it("drops a click whose own re-render landed just before it was timestamped", () => {
    expect(
      filterPosthogDeadClick(
        deadClickEvent({
          $dead_click_last_mutation_timestamp: CLICK_AT - 1,
          $dead_click_absolute_timeout: true,
        }),
      ),
    ).toBeNull();
  });

  it("drops the same inversion when the visibility check reported it first", () => {
    expect(
      filterPosthogDeadClick(
        deadClickEvent({
          $dead_click_last_mutation_timestamp: CLICK_AT - 7,
          $dead_click_absolute_timeout: false,
          $dead_click_visibility_changed_timeout: true,
        }),
      ),
    ).toBeNull();
  });

  it("drops an inverted dead swipe using its own property prefix", () => {
    expect(
      filterPosthogDeadClick(
        deadClickEvent(
          { $dead_swipe_last_mutation_timestamp: CLICK_AT - 2 },
          "$dead_swipe",
        ),
      ),
    ).toBeNull();
  });

  it("keeps a click the page never responded to", () => {
    const event = deadClickEvent({
      $dead_click_last_mutation_timestamp: CLICK_AT - 8_477,
      $dead_click_absolute_timeout: true,
    });
    expect(filterPosthogDeadClick(event)).toBe(event);
  });

  it("keeps a click posthog did measure a mutation delay for", () => {
    const event = deadClickEvent({
      $dead_click_last_mutation_timestamp: CLICK_AT + 2_800,
      $dead_click_mutation_delay_ms: 2_800,
      $dead_click_mutation_timeout: true,
    });
    expect(filterPosthogDeadClick(event)).toBe(event);
  });

  it("keeps a click with no last-mutation timestamp to compare against", () => {
    const event = deadClickEvent({ $dead_click_absolute_timeout: true });
    expect(filterPosthogDeadClick(event)).toBe(event);
  });

  it("keeps a click just outside the inversion window", () => {
    const event = deadClickEvent({
      $dead_click_last_mutation_timestamp: CLICK_AT - 79,
      $dead_click_absolute_timeout: true,
    });
    expect(filterPosthogDeadClick(event)).toBe(event);
  });
});
