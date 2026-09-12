import { useId, useState } from "react";
import { type Event } from "@core/types/event.contracts";
import { type RsvpResponseStatus } from "@core/types/event-attendance.contracts";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import { RsvpScopeDialog } from "@web/views/Forms/EventForm/RsvpScopeDialog";

// Going / Maybe / Decline segmented control (WP-08). Rendered only when the
// calendar's account email appears in the event's attendee list (organizer
// included) — the gate lives in EventForm, but the self lookup here fails
// closed too. Answering is allowed on viewer-access calendars (it is not a
// calendar write), so this control lives outside the form's read-only
// fieldset. Choosing a response on a single event submits immediately; on an
// occurrence of a series it opens the "This Event" / "All Events" choice
// (never this-and-following); a series base answers the whole series.
const RSVP_OPTIONS: ReadonlyArray<{
  status: RsvpResponseStatus;
  label: string;
}> = [
  { status: "accepted", label: "Going" },
  { status: "tentative", label: "Maybe" },
  { status: "declined", label: "Decline" },
];

interface RsvpControlProps {
  /** The live source event (cache-backed, so the optimistic answer paints). */
  event: Event;
  /** The connected account email the self attendee entry is matched by. */
  accountEmail: string;
  /** Jump-target anchor for hold-Mod chips and Mod+- / e then g. */
  id: string;
}

export const RsvpControl = ({ event, accountEmail, id }: RsvpControlProps) => {
  const groupName = useId();
  const labelId = useId();
  const [pendingStatus, setPendingStatus] = useState<RsvpResponseStatus | null>(
    null,
  );
  const { rsvp } = useEventMutations();

  const selfStatus =
    event.content.kind === "details"
      ? event.content.attendees?.find(
          (attendee) =>
            attendee.email.toLowerCase() === accountEmail.toLowerCase(),
        )?.responseStatus
      : undefined;
  // Fail closed: no self entry, nothing to answer (EventForm gates this too).
  if (selfStatus === undefined) return null;

  const respond = (responseStatus: RsvpResponseStatus) => {
    if (responseStatus === selfStatus) return;
    if (event.recurrence.kind === "occurrence") {
      // Recurring: the scope choice decides between this occurrence and the
      // whole series. Single events never see the dialog.
      setPendingStatus(responseStatus);
      return;
    }
    rsvp({
      id: event.id,
      responseStatus,
      // A series base has no single occurrence to answer — its RSVP covers
      // the whole series; a plain event answers itself.
      scope: event.recurrence.kind === "series" ? "all" : "single",
      accountEmail,
    });
  };

  return (
    <>
      <div
        id={id}
        className="flex items-center justify-between gap-2 rounded-md bg-surface-overlay p-3 text-text text-xs"
      >
        <span id={labelId} className="text-text-muted">
          Going?
        </span>
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="flex divide-x divide-border overflow-hidden rounded-md border border-border"
        >
          {RSVP_OPTIONS.map(({ status, label }) => (
            <label key={status} className="cursor-pointer">
              <input
                type="radio"
                name={groupName}
                value={status}
                checked={selfStatus === status}
                onChange={() => respond(status)}
                className="peer sr-only"
              />
              <span className="flex min-h-7 items-center px-2.5 text-text-muted transition-colors hover:bg-surface-raised peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-inset">
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>
      {pendingStatus !== null && (
        <RsvpScopeDialog
          onCancel={() => setPendingStatus(null)}
          onConfirm={(scope) => {
            rsvp({
              id: event.id,
              responseStatus: pendingStatus,
              scope,
              accountEmail,
            });
            setPendingStatus(null);
          }}
        />
      )}
    </>
  );
};
