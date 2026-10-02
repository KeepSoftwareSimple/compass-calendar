import {
  emitProductEventSwift,
  parseProductEventNames,
} from "@scripts/desktop-export/emit-product-event";
import { TRACK_TS_PATH } from "@scripts/desktop-export/paths";
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
});
