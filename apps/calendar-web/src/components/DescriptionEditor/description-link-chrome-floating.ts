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
