import {
  parseCommaSeparatedQueryParam,
  routeParam,
} from "@backend/common/helpers/query-param";
import { describe, expect, it } from "bun:test";

describe("routeParam", () => {
  it("returns a string param unchanged", () => {
    expect(routeParam("slug")).toBe("slug");
  });

  it("returns the first value for repeated params", () => {
    expect(routeParam(["a", "b"])).toBe("a");
  });

  it("returns undefined when absent", () => {
    expect(routeParam(undefined)).toBeUndefined();
  });
});

describe("parseCommaSeparatedQueryParam", () => {
  it("parses comma-separated values", () => {
    expect(parseCommaSeparatedQueryParam("a,b")).toEqual(["a", "b"]);
  });

  it("parses repeated values and mixed comma-separated values", () => {
    expect(parseCommaSeparatedQueryParam(["a,b", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("leaves absent and structurally invalid values for schema validation", () => {
    expect(parseCommaSeparatedQueryParam(undefined)).toBeUndefined();
    expect(
      parseCommaSeparatedQueryParam(["a", { nested: "b" }]),
    ).toBeUndefined();
  });
});
