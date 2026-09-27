/**
 * Pure-ish DOM queries behind the `f` focus-notice shortcut. Notices are
 * elements marked `data-notice`: action toasts and banners. There is no
 * registry or store - the DOM is the source of truth for what is on screen.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Notices with something to focus, toasts first: the toast container runs
 * limit={1}, so at most one toast is up, and it is always the newest thing on
 * screen. Banners follow in document order. Dismissed notices unmount, so
 * presence in the DOM is the visibility check.
 */
export const getVisibleNotices = (): HTMLElement[] => {
  const notices = [
    ...document.querySelectorAll<HTMLElement>("[data-notice]"),
  ].filter((notice) => firstFocusable(notice) !== null);

  const isToast = (notice: HTMLElement) => notice.closest(".Toastify") !== null;
  return [...notices.filter(isToast), ...notices.filter((n) => !isToast(n))];
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
