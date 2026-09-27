import { type CaptureResult } from "posthog-js";
import { filterPosthogWebVitals } from "./posthog-web-vitals-filter.util";
import { describe, expect, it } from "bun:test";

const vitalsEvent = (properties: Record<string, unknown>): CaptureResult =>
  ({
    uuid: "test-uuid",
    event: "$web_vitals",
    properties,
  }) as CaptureResult;

describe("filterPosthogWebVitals", () => {
  it("passes through a null event", () => {
    expect(filterPosthogWebVitals(null)).toBeNull();
  });

  it("passes through non-web-vitals events", () => {
    const event = {
      uuid: "1",
      event: "$pageview",
      properties: { $web_vitals_LCP_value: 0 },
    } as CaptureResult;
    expect(filterPosthogWebVitals(event)).toBe(event);
  });

  it("leaves a genuine measurement untouched", () => {
    const event = vitalsEvent({
      $web_vitals_LCP_value: 2400,
      $web_vitals_FCP_value: 900,
    });
    expect(filterPosthogWebVitals(event)).toBe(event);
    expect(event.properties?.["$web_vitals_LCP_value"]).toBe(2400);
  });

  it("keeps a legitimate CLS of zero", () => {
    const event = vitalsEvent({ $web_vitals_CLS_value: 0 });
    expect(filterPosthogWebVitals(event)).toBe(event);
    expect(event.properties?.["$web_vitals_CLS_value"]).toBe(0);
  });

  it("strips a zeroed LCP but keeps the rest of the batch", () => {
    const event = vitalsEvent({
      $web_vitals_LCP_value: 0,
      $web_vitals_LCP_event: { name: "LCP", value: 0 },
      $web_vitals_FCP_value: 900,
    });

    const filtered = filterPosthogWebVitals(event);

    expect(filtered).toBe(event);
    expect(filtered?.properties).not.toHaveProperty("$web_vitals_LCP_value");
    expect(filtered?.properties).not.toHaveProperty("$web_vitals_LCP_event");
    expect(filtered?.properties?.["$web_vitals_FCP_value"]).toBe(900);
  });

  it("strips every zeroed timing metric", () => {
    const event = vitalsEvent({
      $web_vitals_LCP_value: 0,
      $web_vitals_FCP_value: 0,
      $web_vitals_INP_value: 0,
      $web_vitals_CLS_value: 0.05,
    });

    const filtered = filterPosthogWebVitals(event);

    expect(filtered?.properties).toEqual({ $web_vitals_CLS_value: 0.05 });
  });

  it("drops the event when nothing measurable is left", () => {
    const event = vitalsEvent({
      $web_vitals_LCP_value: 0,
      $web_vitals_LCP_event: { name: "LCP", value: 0 },
    });
    expect(filterPosthogWebVitals(event)).toBeNull();
  });
});
