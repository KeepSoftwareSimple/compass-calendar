const INTERACTIVE_SELECTOR =
  'button, [role="button"], a[href], [tabindex]:not([tabindex="-1"])';

export function interactiveTargetUnderPointer(
  x: number,
  y: number,
): Element | null {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return null;
  const match = hit.closest(INTERACTIVE_SELECTOR);
  return match instanceof Element ? match : null;
}

export function identityForHoverTarget(element: Element): string {
  if (element.id) return `id:${element.id}`;
  const href = element.getAttribute("href");
  if (href) return `href:${href}`;
  const role = element.getAttribute("role") ?? "";
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  const index = parent ? [...parent.children].indexOf(element) : 0;
  return `${tag}:${role}:${index}`;
}
