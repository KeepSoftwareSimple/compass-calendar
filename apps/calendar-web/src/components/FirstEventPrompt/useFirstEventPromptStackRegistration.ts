import { type RefObject, useEffect } from "react";

const STACK_HEIGHT_VAR = "--compass-first-event-prompt-stack-height";
const LIVE_ATTR = "data-first-event-prompt-live";

/** Lifts bottom-anchored toasts while the first-event card is on screen. */
export function useFirstEventPromptStackRegistration(
  anchorRef: RefObject<HTMLElement | null>,
  live: boolean,
): void {
  useEffect(() => {
    const root = document.documentElement;

    if (!live) {
      root.removeAttribute(LIVE_ATTR);
      root.style.removeProperty(STACK_HEIGHT_VAR);
      return;
    }

    root.setAttribute(LIVE_ATTR, "");

    const anchor = anchorRef.current;
    if (!anchor) return;

    const syncHeight = () => {
      const { height } = anchor.getBoundingClientRect();
      root.style.setProperty(STACK_HEIGHT_VAR, `${Math.ceil(height + 12)}px`);
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(anchor);

    return () => {
      observer.disconnect();
      root.removeAttribute(LIVE_ATTR);
      root.style.removeProperty(STACK_HEIGHT_VAR);
    };
  }, [anchorRef, live]);
}
