import { flip, type Middleware, offset, shift } from "@floating-ui/react";

const CHROME_BOUNDARY_PADDING_PX = 8;
/** Clear gap below the link line so inline trailing text stays visible. */
const CHROME_BELOW_LINK_OFFSET_PX = 6;

export const DESCRIPTION_LINK_CHROME_PLACEMENT = "bottom-start" as const;

/** Only above the link when there is no room below; never beside the link. */
export const DESCRIPTION_LINK_CHROME_FALLBACK_PLACEMENTS = [
  "top-start",
] as const;

export const descriptionLinkChromeMiddleware = (
  boundary: HTMLElement,
): Middleware[] => [
  offset({ mainAxis: CHROME_BELOW_LINK_OFFSET_PX, crossAxis: 0 }),
  flip({
    boundary,
    padding: CHROME_BOUNDARY_PADDING_PX,
    fallbackPlacements: [...DESCRIPTION_LINK_CHROME_FALLBACK_PLACEMENTS],
  }),
  shift({
    boundary,
    padding: CHROME_BOUNDARY_PADDING_PX,
  }),
];

export const rectsIntersect = (
  a: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  b: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Client rects for non-empty text nodes under `root` (description copy only). */
export const collectDescriptionTextRects = (root: HTMLElement): DOMRect[] => {
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent?.trim();
    if (text) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && rect.height > 0) {
          rects.push(rect);
        }
      }
    }
    node = walker.nextNode();
  }
  return rects;
};
