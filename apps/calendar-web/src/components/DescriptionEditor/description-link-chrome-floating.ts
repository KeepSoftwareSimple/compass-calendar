import { flip, type Middleware, offset, shift, size } from "@floating-ui/react";

const CHROME_BOUNDARY_PADDING_PX = 8;
/** Upper cap for the hint width when plenty of room remains in the panel. */
const CHROME_MAX_WIDTH_PX = 288;
/** Clear gap below the link line so inline trailing text stays visible. */
const CHROME_BELOW_LINK_OFFSET_PX = 6;

export const DESCRIPTION_LINK_CHROME_PLACEMENT = "bottom-start" as const;

/** Only above the link when there is no room below; never beside the link. */
export const DESCRIPTION_LINK_CHROME_FALLBACK_PLACEMENTS = [
  "top-start",
] as const;

const clipsOverflow = (element: Element): boolean => {
  const style = window.getComputedStyle(element);
  const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
  return /(auto|scroll|hidden|clip)/.test(overflow);
};

/** Nearest ancestor that clips description content (sidebar scroll, panel, …). */
export const descriptionLinkChromeBoundary = (
  editorRoot: HTMLElement,
): Element => {
  let node: Element | null = editorRoot.parentElement;
  while (node && node !== document.body) {
    if (clipsOverflow(node)) return node;
    node = node.parentElement;
  }
  return editorRoot;
};

export const descriptionLinkChromeMiddleware = (
  boundary: Element,
): Middleware[] => [
  offset({ mainAxis: CHROME_BELOW_LINK_OFFSET_PX, crossAxis: 0 }),
  size({
    padding: CHROME_BOUNDARY_PADDING_PX,
    apply({ availableWidth, elements }) {
      const maxWidth = Math.min(
        CHROME_MAX_WIDTH_PX,
        Math.max(availableWidth, 0),
      );
      Object.assign(elements.floating.style, {
        maxWidth: maxWidth > 0 ? `${maxWidth}px` : "",
      });
    },
  }),
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
