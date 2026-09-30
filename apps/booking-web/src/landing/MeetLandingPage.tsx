import { PublicBookingLayout } from "@booking-web/booking/PublicBookingLayout";
import { PUBLIC_BOOKING_HEADING_CLASS } from "@booking-web/booking/PublicBookingStatusMessage";
import { useBookingDocumentTitle } from "@booking-web/booking/use-booking-document-title";
import {
  trackBookingLandingViewed,
  trackBookingSetupCtaClicked,
} from "@booking-web/telemetry/guest-booking-funnel";
import { useEffect, useRef } from "react";
import { MEETING_SETUP_SEARCH_PARAM } from "@web/booking/meeting-setup.search";

/**
 * Bare `/meet` is the landing page for the Meeting feature. It explains the
 * product and points at the one CTA the footer already uses
 * (`/?meetingSetup=1`): anonymous visitors get the local setup wizard,
 * signed-in hosts get Settings > Meeting. No auth awareness lives here.
 */
export function MeetLandingPage() {
  const setupHref = `/?${MEETING_SETUP_SEARCH_PARAM}=1`;
  const viewedRef = useRef(false);

  useBookingDocumentTitle("Meeting pages");

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackBookingLandingViewed();
  }, []);

  return (
    <PublicBookingLayout>
      <header className="flex flex-col gap-2">
        <h1 className={PUBLIC_BOOKING_HEADING_CLASS}>
          Let people book time with you
        </h1>
        <p className="text-sm text-text-muted">
          Share one link. Guests pick a time that is free on your calendar, and
          the meeting lands on both calendars with an invite.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <a
          className="c-focus-ring inline-flex min-h-11 w-fit items-center rounded-md bg-accent px-4 font-medium text-on-accent text-sm hover:bg-accent-hover"
          href={setupHref}
          onClick={() => trackBookingSetupCtaClicked("landing")}
        >
          Set up your meeting page
        </a>
        <p className="text-sm text-text-muted">
          Free to set up. Going live starts a 7-day trial.
        </p>
      </div>

      <section
        aria-labelledby="meet-how-heading"
        className="flex flex-col gap-2"
      >
        <h2 id="meet-how-heading" className="font-medium text-text">
          How it works
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-text">
          <li>Pick your address, hours, and meeting length.</li>
          <li>Connect the calendar you want meetings on.</li>
          <li>
            Share compasscalendar.com/meet/your-name. Guests book without an
            account.
          </li>
        </ol>
      </section>

      <p className="text-sm text-text-muted">
        Already use Compass Calendar? The same link{" "}
        <a
          className="c-focus-ring rounded-sm text-accent underline"
          href={setupHref}
          onClick={() => trackBookingSetupCtaClicked("landing")}
        >
          opens Meeting settings
        </a>
        , where you can turn your page on or copy your link.
      </p>
    </PublicBookingLayout>
  );
}
