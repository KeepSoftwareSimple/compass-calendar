import { flip, type Middleware, offset, shift } from "@floating-ui/react";

const CHROME_BOUNDARY_PADDING_PX = 8;
const CHROME_OFFSET_PX = 4;

/** Never flip to the left of the link; below/above keeps the sidebar from clipping. */
export const DESCRIPTION_LINK_CHROME_FALLBACK_PLACEMENTS = [
  "bottom-start",
  "top-start",
  "right-end",
  "bottom-end",
  "top-end",
] as const;

export const descriptionLinkChromeMiddleware = (
  boundary: HTMLElement,
): Middleware[] => [
  offset(CHROME_OFFSET_PX),
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
