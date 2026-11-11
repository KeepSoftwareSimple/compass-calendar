import {
  DESCRIPTION_LINK_CHROME_FALLBACK_PLACEMENTS,
  DESCRIPTION_LINK_CHROME_PLACEMENT,
  descriptionLinkChromeBoundary,
} from "@web/components/DescriptionEditor/description-link-chrome-floating";
import { rectsIntersect } from "@web/components/DescriptionEditor/description-link-chrome-geometry.test.utils";
import { describe, expect, it } from "bun:test";

describe("descriptionLinkChromeMiddleware", () => {
  it("anchors below the link, not beside it", () => {
    expect(DESCRIPTION_LINK_CHROME_PLACEMENT).toBe("bottom-start");
    for (const placement of DESCRIPTION_LINK_CHROME_FALLBACK_PLACEMENTS) {
      expect(placement.startsWith("left")).toBe(false);
      expect(placement.startsWith("right")).toBe(false);
    }
  });

  it("prefers the nearest clipping ancestor as the positioning boundary", () => {
    const panel = document.createElement("section");
    panel.style.overflow = "hidden";
    const editor = document.createElement("div");
    panel.appendChild(editor);
    document.body.appendChild(panel);
    try {
      expect(descriptionLinkChromeBoundary(editor)).toBe(panel);
    } finally {
      panel.remove();
    }
  });
});

describe("rectsIntersect", () => {
  it("detects rectangle overlap", () => {
    expect(
      rectsIntersect(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 5, top: 5, right: 15, bottom: 15 },
      ),
    ).toBe(true);
    expect(
      rectsIntersect(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 10, top: 0, right: 20, bottom: 10 },
      ),
    ).toBe(false);
  });
});
