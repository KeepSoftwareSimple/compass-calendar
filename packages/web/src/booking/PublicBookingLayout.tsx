import { type PropsWithChildren } from "react";

export const PUBLIC_BOOKING_STICKY_STEP_CLASS =
  "sticky bottom-0 z-10 -mx-4 border-border border-t bg-background px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-0 sm:py-0";

interface PublicBookingLayoutProps extends PropsWithChildren {
  wide?: boolean;
}

/**
 * Public booking is a viewport-height page. The calendar shell clips
 * `html`/`body`/`#root` with `overflow: hidden`; this layout is itself
 * the scrollport (`h-dvh` + `overflow-y-auto` on `main`) so guests can
 * reach later time slots without the page overflowing the window.
 * `data-document-scroll` remains a fallback (see `index.css`).
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
        className={`mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-10 ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
