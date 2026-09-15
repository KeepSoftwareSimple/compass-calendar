import { stripUnusedPhosphorWeights } from "../../plugins/phosphor-weights.plugin";
import { describe, expect, it } from "bun:test";

describe("stripUnusedPhosphorWeights", () => {
  it("keeps regular, bold, and fill, and drops the unused weights", () => {
    const source = `const e = /* @__PURE__ */ new Map([
  [
    "bold",
    /* @__PURE__ */ a.createElement("path", { d: "bold" })
  ],
  [
    "duotone",
    /* @__PURE__ */ a.createElement("path", { d: "duotone" })
  ],
  [
    "fill",
    /* @__PURE__ */ a.createElement("path", { d: "fill" })
  ],
  [
    "light",
    /* @__PURE__ */ a.createElement("path", { d: "light" })
  ],
  [
    "regular",
    /* @__PURE__ */ a.createElement("path", { d: "regular" })
  ],
  [
    "thin",
    /* @__PURE__ */ a.createElement("path", { d: "thin" })
  ]
]);
`;
    const stripped = stripUnusedPhosphorWeights(source);
    expect(stripped).toContain('"bold"');
    expect(stripped).toContain('"fill"');
    expect(stripped).toContain('"regular"');
    expect(stripped).not.toContain('"thin"');
    expect(stripped).not.toContain('"light"');
    expect(stripped).not.toContain('"duotone"');
  });
});
