/** Smallest visible sliver that still reads as "this event". */
export const MIN_VISIBLE_HINT_SIZE_PX = 8;

const CLIPPING_OVERFLOW = new Set(["auto", "scroll", "hidden", "clip"]);

export type HintRect = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

const isClippingOverflow = (value: string): boolean =>
  CLIPPING_OVERFLOW.has(value);

export const intersectHintRects = (
  a: HintRect,
  b: HintRect,
): HintRect | null => {
  const top = Math.max(a.top, b.top);
  const left = Math.max(a.left, b.left);
  const bottom = Math.min(a.bottom, b.bottom);
  const right = Math.min(a.right, b.right);
  if (
    bottom - top < MIN_VISIBLE_HINT_SIZE_PX ||
    right - left < MIN_VISIBLE_HINT_SIZE_PX
  ) {
    return null;
  }
  return { top, left, bottom, right };
};

const toHintRect = (rect: DOMRectReadOnly): HintRect => ({
  top: rect.top,
  left: rect.left,
  bottom: rect.bottom,
  right: rect.right,
});

const clipRectForAncestor = (node: HTMLElement): HintRect | null => {
  const style = getComputedStyle(node);
  const clipsX = isClippingOverflow(style.overflowX);
  const clipsY = isClippingOverflow(style.overflowY);
  if (!clipsX && !clipsY) return null;

  const rect = node.getBoundingClientRect();
  return {
    top: clipsY ? rect.top : Number.NEGATIVE_INFINITY,
    left: clipsX ? rect.left : Number.NEGATIVE_INFINITY,
    bottom: clipsY ? rect.bottom : Number.POSITIVE_INFINITY,
    right: clipsX ? rect.right : Number.POSITIVE_INFINITY,
  };
};

/**
 * Visible portion of an event card after viewport and overflow-ancestor
 * clipping. Walks parents so the card's own overflow-hidden does not hide
 * the portaled chip. Returns null when too little of the card is in view.
 */
export const getVisibleHintRect = (element: HTMLElement): HintRect | null => {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  let visible: HintRect | null = intersectHintRects(toHintRect(rect), {
    top: 0,
    left: 0,
    bottom: window.innerHeight,
    right: window.innerWidth,
  });
  if (!visible) return null;

  for (
    let node: HTMLElement | null = element.parentElement;
    node;
    node = node.parentElement
  ) {
    const clip = clipRectForAncestor(node);
    if (!clip) continue;
    visible = intersectHintRects(visible, clip);
    if (!visible) return null;
  }

  return visible;
};
