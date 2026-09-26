import { MEETING_SETUP_SEARCH_PARAM } from "@web/booking/guest-meeting-setup.util";

/**
 * One quiet line that serves both audiences: hosts previewing their own page
 * get a way back to their calendar, and guests learn the page is Compass.
 * `/` is same-origin in every deploy, so no host config is needed.
 */
export function PublicBookingFooter() {
  const setupHref = `/?${MEETING_SETUP_SEARCH_PARAM}=1`;

  return (
    <footer className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 border-border border-t pt-4 text-sm text-text-muted">
      <p>
        <span className="font-medium text-text">Compass Calendar</span>, the
        keyboard calendar.
      </p>
      <a
        className="c-focus-ring rounded-md text-text underline"
        href={setupHref}
      >
        Set up your own meeting page
      </a>
    </footer>
  );
}
