import { mergeEditableContentColor } from "@core/util/event/merge-editable-content-color";
import { describe, expect, it } from "bun:test";

describe("mergeEditableContentColor", () => {
  const base = { title: "Meet" };

  it("clears a slot when incoming color is null", () => {
    expect(
      mergeEditableContentColor(
        { color: "blue" as const },
        { color: null },
        base,
      ),
    ).toEqual({ title: "Meet" });
  });

  it("keeps colorHex when incoming color is null on a hex-only event", () => {
    expect(
      mergeEditableContentColor({ colorHex: "#E67C73" }, { color: null }, base),
    ).toEqual({ title: "Meet", colorHex: "#E67C73" });
  });

  it("applies a new slot color", () => {
    expect(
      mergeEditableContentColor(
        { color: "blue" as const, colorHex: "#009688" },
        { color: "coral" },
        base,
      ),
    ).toEqual({ title: "Meet", color: "coral" });
  });

  it("preserves existing color fields when incoming omits color", () => {
    expect(
      mergeEditableContentColor({ color: "red" as const }, {}, base),
    ).toEqual({ title: "Meet", color: "red" });
  });
});
