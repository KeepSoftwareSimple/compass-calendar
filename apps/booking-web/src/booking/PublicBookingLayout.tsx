import { PublicBookingFooter } from "@booking-web/booking/PublicBookingFooter";
import { type PropsWithChildren } from "react";

/**
 * A compact bar that stays at the bottom of the phone viewport while the
 * slot list scrolls under it (reschedule Confirm). Wrap a button and a
 * line of context only: a sticky box taller than the free space is
 * shifted up over earlier siblings, so forms must never use this.
 */
export const PUBLIC_BOOKING_ACTION_BAR_CLASS =
  "sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-border border-t bg-background px-4 py-3 shadow-[0_-8px_16px_-12px_var(--color-shadow-default)] sm:static sm:mx-0 sm:border-0 sm:px-0 sm:py-0 sm:shadow-none";

/** Quiet text link with a 44px tap target. Accent, not the footer brand link. */
export const PUBLIC_BOOKING_TEXT_LINK_CLASS =
  "c-focus-ring inline-flex min-h-11 items-center text-accent text-sm underline";

interface PublicBookingLayoutProps extends PropsWithChildren {
  wide?: boolean;
}

/**
 * Public booking is a viewport-height page. The calendar shell clips
 * `html`/`body`/`#root` with `overflow: hidden`; this layout is itself
 * the scrollport (`h-dvh` + `overflow-y-auto` on `main`) so guests can
 * reach later time slots without the page overflowing the window.
 * `data-document-scroll` remains a fallback (see `index.css`).
 *
 * `main` pads the top only: a `sticky bottom-0` child of a scroll
 * container is clamped to the scroller's content edge, so bottom padding
 * here would float the action bar above the viewport with slots showing
 * beneath it. The footer carries the bottom spacing instead.
 */
export function PublicBookingLayout({
  children,
  wide = false,
}: PublicBookingLayoutProps) {
  return (
    <div
      data-document-scroll
      className="relative flex h-dvh flex-col overflow-hidden bg-background text-text"
    >
      <main
        className={`mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-10 ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        {children}
        <PublicBookingFooter />
      </main>
    </div>
  );
}
