import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { useState } from "react";
import { type EventContent } from "@core/types/event.contracts";
import { CopyButton } from "@web/components/CopyButton/CopyButton";
import { AttendeeRsvpStatus } from "@web/views/Forms/EventForm/AttendeeRsvpStatus";
import {
  ATTENDEE_RSVP_LABEL,
  formatAttendeeRsvpTally,
} from "@web/views/Forms/EventForm/attendee-rsvp";

type EventDetails = Extract<EventContent, { kind: "details" }>;

const EVENT_FORM_GUEST_LIST_ID = "event-form-guest-list";
/** Focus target for the `e m` / `Mod+=` "meeting link" field: the join link
 * here on an existing event, or the "Add Google Meet" switch on a create
 * draft (EventForm renders whichever applies, never both). */
export const EVENT_FORM_CONFERENCE_ID = "event-form-conference";

interface EventDetailsSectionProps {
  details: Pick<EventDetails, "organizer" | "attendees" | "conference">;
  /**
   * Set when the editable AttendeeField owns the guest list for this event —
   * this section then renders only the remaining read-only details (the
   * conference link) instead of duplicating the guests below the editor.
   */
  hideAttendees?: boolean;
}

const MAX_VISIBLE_ATTENDEES = 6;

/**
 * Read-only display for provider-sourced event fields Compass doesn't let
 * the user edit: the Google Meet link and the attendee list with RSVP
 * status. Location is editable now (see EventForm.tsx's own location
 * field) and no longer rendered here. Rendered only when the event has at
 * least one of these - absent for a plain Compass-native event and for a
 * busy-projection event (whose content carries none of this).
 */
export const EventDetailsSection = ({
  details,
  hideAttendees = false,
}: EventDetailsSectionProps) => {
  const { organizer, attendees = [], conference } = details;
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const hasAttendees = attendees.length > 0 && !hideAttendees;

  if (!conference && !hasAttendees) return null;

  const visibleAttendees = showAllAttendees
    ? attendees
    : attendees.slice(0, MAX_VISIBLE_ATTENDEES);
  const hiddenAttendeeCount = attendees.length - visibleAttendees.length;

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-overlay p-3 text-text text-xs">
      {conference && (
        <div className="flex items-center gap-2">
          <a
            id={EVENT_FORM_CONFERENCE_ID}
            href={conference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="c-focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-xs hover:underline"
          >
            <VideoCameraIcon size={16} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate">
              {conference.label ?? "Join meeting"}
            </span>
          </a>
          <CopyButton label="copy meeting link" text={conference.url} />
        </div>
      )}

      {hasAttendees && (
        <div
          id={EVENT_FORM_GUEST_LIST_ID}
          tabIndex={-1}
          className="c-focus-ring flex flex-col gap-1.5 rounded-xs"
        >
          <div className="flex items-center gap-2 text-text-muted">
            <UsersIcon size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">
              {formatAttendeeRsvpTally(
                attendees.map((attendee) => attendee.responseStatus),
              )}
            </span>
          </div>
          <ul className="flex flex-col gap-1 pl-6">
            {visibleAttendees.map((attendee) => {
              const name = attendee.displayName ?? attendee.email;
              const isOrganizer = organizer?.email === attendee.email;
              // The badge is a color+icon signal; title is a mouse-only
              // tooltip, so the row's aria-label carries the same info as
              // accessible text.
              const statusText = ATTENDEE_RSVP_LABEL[attendee.responseStatus];
              return (
                <li
                  key={attendee.email}
                  className="flex items-center gap-2"
                  aria-label={`${name}, ${statusText}${isOrganizer ? ", organizer" : ""}`}
                >
                  <AttendeeRsvpStatus status={attendee.responseStatus} />
                  <span className="min-w-0 flex-1 truncate">
                    {name}
                    {isOrganizer && " (organizer)"}
                  </span>
                  <CopyButton
                    label={`copy ${attendee.email}`}
                    text={attendee.email}
                  />
                </li>
              );
            })}
          </ul>
          {hiddenAttendeeCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllAttendees(true)}
              className="c-focus-ring self-start rounded-xs pl-6 text-left text-text-muted hover:underline"
            >
              +{hiddenAttendeeCount} more
            </button>
          )}
        </div>
      )}
    </div>
  );
};
