import { stripeExpandableId } from "@backend/billing/stripe-expandable-id.util";
import { describe, expect, it } from "bun:test";

describe("stripeExpandableId", () => {
  it("reads a non-empty id string", () => {
    expect(stripeExpandableId("cus_1")).toBe("cus_1");
  });

  it("reads an expanded object id", () => {
    expect(stripeExpandableId({ id: "sub_1" })).toBe("sub_1");
  });

  it("ignores empty strings and objects without an id", () => {
    expect(stripeExpandableId("")).toBeUndefined();
    expect(stripeExpandableId({})).toBeUndefined();
    expect(stripeExpandableId(null)).toBeUndefined();
  });
});
