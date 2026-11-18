import { PublicBookingLayout } from "@booking-web/booking/PublicBookingLayout";
import { useBookingDocumentTitle } from "@booking-web/booking/use-booking-document-title";
import { MeetLandingExample } from "@booking-web/landing/MeetLandingExample";
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
    <PublicBookingLayout showFooter={false} wide>
      <header className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-muted">Compass Calendar / Meetings</p>
        <h1 className="text-balance font-[VT323,monospace] font-normal text-4xl leading-none sm:text-5xl">
          {MEET_LANDING_HEADLINE}
        </h1>
        <p className="max-w-lg text-base text-text-muted">
          {MEET_LANDING_SUPPORTING}
        </p>
        <a
          className="c-focus-ring mt-2 inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-medium text-on-accent text-sm hover:bg-accent-hover"
          href={setupHref}
          onClick={() => trackBookingSetupCtaClicked("landing")}
        >
          {MEET_LANDING_CTA_LABEL}
        </a>
      </header>
      <MeetLandingExample />
    </PublicBookingLayout>
  );
}
