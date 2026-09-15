import { type Event } from "@core/types/event.contracts";
import {
  type Attendee,
  type AttendeeInput,
} from "@core/types/event-attendance.contracts";
import { type CreateEventInput } from "@core/types/event-command.contracts";

// Details content from either side of the wire: the read-shaped
// Event["content"] or the stricter write-input content (whose attendee
// entries carry no responseStatus). The helpers below only touch the fields
// the two shapes share.
type DetailsContentSource =
  | Extract<Event["content"], { kind: "details" }>
  | CreateEventInput["content"];

// Event["content"].location is nullable/optional (a provider-sourced event
// may never have set one, and older local records predate the field
// entirely), but every editable-content consumer (draft values, replay
// payloads sent to mutations.replace/create) needs a definite string. Shared
// so every read of a stored event's location defaults it the same way -
// also used by useUndoRedo.ts's replay/comparison paths.
export const detailsLocation = (content: DetailsContentSource): string =>
  content.location ?? "";

// Wire-boundary attendee pick: only a genuine guest edit may cross. Replay
// flows (undo/redo, snapshot restore in useUndoRedo) deliberately funnel a
// full read-side Event["content"] through the write input type, so their
// attendee entries carry responseStatus as excess structure — those must
// keep today's preserve semantics (drop the key: the strict
// AttendeeInputSchema would reject them, and a replayed non-organizer edit
// must not start tripping sync's organizer guard). A genuine guest-edit
// input's entries never carry responseStatus; they are re-picked to the
// exact input shape so no excess key can leak onto the wire.
const intendedAttendeeInputs = (
  attendees: ReadonlyArray<Attendee | AttendeeInput> | undefined,
): readonly AttendeeInput[] | undefined => {
  if (attendees === undefined) return undefined;
  const isGenuineGuestEdit = attendees.every(
    (attendee) => !("responseStatus" in attendee),
  );
  if (!isGenuineGuestEdit) return undefined;
  return attendees.map(({ email, displayName }) => ({ email, displayName }));
};

// The write contracts (CreateEventInputSchema/ReplaceEventInputSchema) accept
// only the editable subset via a strict content schema; a read-shaped
// Event["content"] also carries provider-sourced organizer/attendees/
// conference/colorHex (added for the read side by #2555). A spread bypasses
// TypeScript's excess-property checks, so this runtime pick is the only thing
// that keeps a replayed/round-tripped event from failing that strict schema.
// Preserves color's absent-vs-null distinction: omitted leaves sync's color
// alone, null clears it (see EditableContentSchema's comment) - a spread of
// `color` would already do this correctly, this mirrors that.
// Attendees cross only for genuine guest edits (see intendedAttendeeInputs);
// omitted means "not editing guests" and preserves the provider list.
export const editableContent = (content: DetailsContentSource) => {
  const attendees = intendedAttendeeInputs(content.attendees);
  return {
    kind: "details" as const,
    title: content.title,
    description: content.description,
    location: detailsLocation(content),
    ...(content.color !== undefined ? { color: content.color } : {}),
    ...(attendees !== undefined ? { attendees } : {}),
  };
};
