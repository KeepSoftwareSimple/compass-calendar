import {
  emitProductEventNativeCoverageSwift,
  emitProductEventSwift,
  parseProductEventNames,
} from "@scripts/desktop-export/emit-product-event";
import { TRACK_TS_PATH } from "@scripts/desktop-export/paths";
import { NATIVE_PRODUCT_EVENT_CALL_SITES } from "@core/desktop/native-product-events.manifest";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("emit-product-event", () => {
  it("parses the ProductEvent union from track.ts", () => {
    const source = readFileSync(TRACK_TS_PATH, "utf8");
    const events = parseProductEventNames(source);
    expect(events).toContain("shortcut_invoked");
    expect(events.length).toBeGreaterThan(20);
  });

  it("emits Swift cases for every parsed event", () => {
    const swift = emitProductEventSwift();
    const events = parseProductEventNames(readFileSync(TRACK_TS_PATH, "utf8"));
    for (const event of events) {
      expect(swift).toContain(`"${event}"`);
    }
  });

  it("partitions native call sites and web-only events", () => {
    const events = parseProductEventNames(readFileSync(TRACK_TS_PATH, "utf8"));
    const native = new Set(NATIVE_PRODUCT_EVENT_CALL_SITES);
    expect(native.size).toBe(NATIVE_PRODUCT_EVENT_CALL_SITES.length);
    for (const event of NATIVE_PRODUCT_EVENT_CALL_SITES) {
      expect(events).toContain(event);
    }
    const webOnly = events.filter((event) => !native.has(event));
    expect(native.size + webOnly.length).toBe(events.length);
    const coverage = emitProductEventNativeCoverageSwift();
    expect(coverage).toContain("validatePartition");
  });
});
