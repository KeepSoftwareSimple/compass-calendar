import { trackBookingSetupCtaClicked } from "@booking-web/telemetry/guest-booking-funnel";
import { MEETING_SETUP_SEARCH_PARAM } from "@web/booking/meeting-setup.search";

/**
 * One quiet line that serves both audiences: hosts previewing their own page
 * get a way back to their calendar, and guests learn the page is Compass.
 * `/` is same-origin in every deploy, so no host config is needed.
 */
export function PublicBookingFooter() {
  const setupHref = `/?${MEETING_SETUP_SEARCH_PARAM}=1`;

  return (
    <footer className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 border-border border-t pt-4 pb-10 text-sm text-text-muted">
      <p>
        <span className="font-medium text-text">Compass Calendar</span>, the
        keyboard calendar.
      </p>
      <a
        className="c-focus-ring inline-flex min-h-11 items-center rounded-md text-text underline"
        href={setupHref}
        onClick={() => trackBookingSetupCtaClicked("footer")}
      >
        Set up your own meeting page
      </a>
    </footer>
  );
}
