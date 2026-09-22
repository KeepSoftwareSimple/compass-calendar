import { useEffect, useRef } from "react";

let pendingPublicBookingPageHeadingFocus = false;

/** Arm host-page h1 focus for the next `/meet/:slug` mount (confirmation Escape). */
export function requestPublicBookingPageHeadingFocus() {
  pendingPublicBookingPageHeadingFocus = true;
}

export function isPublicBookingPageHeadingFocusPending() {
  return pendingPublicBookingPageHeadingFocus;
}

export function releasePublicBookingPageHeadingFocus() {
  pendingPublicBookingPageHeadingFocus = false;
}

/** Focus the booking status heading when `viewKey` changes. */
export function useBookingHeadingFocus(viewKey: unknown) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: viewKey is the focus key
  useEffect(() => {
    headingRef.current?.focus();
  }, [viewKey]);

  return headingRef;
}
