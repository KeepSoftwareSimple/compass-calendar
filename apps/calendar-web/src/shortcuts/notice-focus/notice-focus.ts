/**
 * Pure-ish DOM queries behind the `p` focus-notice shortcut. Notices are
 * elements marked `data-notice`: action toasts and banners. There is no
 * registry or store - the DOM is the source of truth for what is on screen.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Notices with something to focus. The bottom-left queue shows one panel at a
 * time; dismissed notices unmount, so presence in the DOM is the visibility
 * check.
 */
export const getVisibleNotices = (): HTMLElement[] => {
  return [...document.querySelectorAll<HTMLElement>("[data-notice]")].filter(
    (notice) => firstFocusable(notice) !== null,
  );
};

const firstFocusable = (notice: HTMLElement): HTMLElement | null =>
  notice.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);

/**
 * The control to focus next: the first focusable of the first notice, or of
 * the notice after the one that currently contains focus (wrapping), so
 * repeat presses cycle.
 */
export const findNextNoticeTarget = (
  notices: HTMLElement[],
  activeElement: Element | null,
): HTMLElement | null => {
  if (notices.length === 0) return null;

  const currentIndex = activeElement
    ? notices.findIndex((notice) => notice.contains(activeElement))
    : -1;
  const next = notices[(currentIndex + 1) % notices.length];
  return firstFocusable(next);
};
