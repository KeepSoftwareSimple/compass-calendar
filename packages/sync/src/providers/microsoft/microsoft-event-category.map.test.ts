import {
  microsoftCategoryFields,
  outlookCategoryNameToSlot,
  slotToOutlookCategoryName,
} from "@sync/providers/microsoft/microsoft-event-category.map";
import { describe, expect, it } from "bun:test";

describe("microsoft-event-category.map", () => {
  it("maps slots to Compass picker labels for Graph categories", () => {
    expect(slotToOutlookCategoryName("coral")).toBe("Coral");
    expect(slotToOutlookCategoryName("blue")).toBe("Blue");
  });

  it("resolves Compass category names and legacy suffixes back to slots", () => {
    expect(outlookCategoryNameToSlot("Coral")).toBe("coral");
    expect(outlookCategoryNameToSlot("Blue category")).toBe("blue");
  });

  it("builds Graph category fields for writes", () => {
    expect(microsoftCategoryFields(undefined)).toEqual({});
    expect(microsoftCategoryFields(null)).toEqual({ categories: [] });
    expect(microsoftCategoryFields("mint")).toEqual({ categories: ["Mint"] });
  });
});
