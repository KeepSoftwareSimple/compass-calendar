import { PublicBookingLayout } from "@booking-web/booking/PublicBookingLayout";
import { useBookingDocumentTitle } from "@booking-web/booking/use-booking-document-title";
import {
  MEET_LANDING_CTA_LABEL,
  MEET_LANDING_DOCUMENT_TITLE,
  MEET_LANDING_HEADLINE,
  MEET_LANDING_SUPPORTING,
} from "@booking-web/landing/meet-landing.copy";
import {
  trackBookingLandingViewed,
  trackBookingSetupCtaClicked,
} from "@booking-web/telemetry/guest-booking-funnel";
import { useEffect, useRef } from "react";
import { meetingSetupRootHref } from "@web/booking/meeting-setup.search";

/** Retro VT323 wordmark heading, matching the calendar's welcome and auth screens. */
const MEET_LANDING_HEADING_CLASS =
  "font-[VT323,monospace] font-normal text-4xl text-text leading-none";

/**
 * Bare `/meet` is the landing page for meeting pages. One headline, one line,
 * one CTA to `/?meetingSetup=1` (guest wizard or Meeting settings when signed
 * in). No trial copy or logged-in callouts on this page.
 */
export function MeetLandingPage() {
  const setupHref = meetingSetupRootHref();
  const viewedRef = useRef(false);

  useBookingDocumentTitle(MEET_LANDING_DOCUMENT_TITLE);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackBookingLandingViewed();
  }, []);

  return (
    <PublicBookingLayout showFooter={false}>
      <header className="flex flex-col gap-3">
        <h1 className={MEET_LANDING_HEADING_CLASS}>{MEET_LANDING_HEADLINE}</h1>
        <p className="text-sm text-text-muted">{MEET_LANDING_SUPPORTING}</p>
      </header>

      <a
        className="c-focus-ring inline-flex min-h-11 w-fit items-center rounded-md bg-accent px-4 font-medium text-on-accent text-sm hover:bg-accent-hover"
        href={setupHref}
        onClick={() => trackBookingSetupCtaClicked("landing")}
      >
        {MEET_LANDING_CTA_LABEL}
      </a>
    </PublicBookingLayout>
  );
}
