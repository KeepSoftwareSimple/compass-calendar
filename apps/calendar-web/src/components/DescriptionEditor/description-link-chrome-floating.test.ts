import { DESCRIPTION_LINK_CHROME_FALLBACK_PLACEMENTS } from "@web/components/DescriptionEditor/description-link-chrome-floating";
import { describe, expect, it } from "bun:test";

describe("descriptionLinkChromeMiddleware", () => {
  it("never flips the chrome to the left of the link", () => {
    for (const placement of DESCRIPTION_LINK_CHROME_FALLBACK_PLACEMENTS) {
      expect(placement.startsWith("left")).toBe(false);
    }
  });
});
