import { type Attendee } from "@core/types/event-attendance.contracts";
import { type SyncEventContent } from "@core/types/sync/event.contracts";

// Browser edits only title + description + location (+ optional color). An
// update command still carries a full SyncEventContent (strict schema), and
// the Compass API pads richer fields with null/[] — applying that verbatim
// would wipe attendees/conference Sync already holds from the provider.
//
// Merge editable fields from the command; keep the rest from existing.
// Color: slot replaces, null clears (omit the field), omit keeps existing.
// colorHex is provider-read-only; a slot write (or clear of a prior slot)
// must drop it so palette resolution cannot resurrect the old fill after
// settle. Drafts often send color:null for "no slot" on hex-only events —
// that must not wipe colorHex.
export function resolveUpdateContent(
  stored: SyncEventContent,
  incoming: SyncEventContent | undefined,
  fallback: SyncEventContent,
): SyncEventContent {
  return incoming === undefined
    ? fallback
    : mergeUpdateContent(stored, incoming);
}

export function resolveUpdateSchedule<T>(
  incoming: T | undefined,
  fallback: T,
): T {
  return incoming ?? fallback;
}

export function mergeUpdateContent(
  existing: SyncEventContent,
  incoming: SyncEventContent,
): SyncEventContent {
  const {
    color: existingColor,
    colorHex: existingColorHex,
    ...existingRest
  } = existing;
  const merged: SyncEventContent = {
    ...existingRest,
    title: incoming.title,
    description: incoming.description,
    location: incoming.location,
  };

  if (incoming.color === null) {
    if (existingColor !== undefined) return merged;
    return existingColorHex !== undefined
      ? { ...merged, colorHex: existingColorHex }
      : merged;
  }
  if (incoming.color !== undefined) {
    return { ...merged, color: incoming.color };
  }

  let kept = merged;
  if (existingColor !== undefined) kept = { ...kept, color: existingColor };
  if (existingColorHex !== undefined) {
    kept = { ...kept, colorHex: existingColorHex };
  }
  return kept;
}

// Merge an intended guest membership (an attendeesEdit "replace" command's
// attendee set) against the attendee list the provider currently holds.
// Membership is keyed by email, case-insensitively — providers treat addresses
// that differ only in case as the same guest:
//   - retained emails keep the provider's entry verbatim: responseStatus and
//     displayName are provider-owned facts a Compass guest edit must not
//     reset, so a concurrent RSVP between syncs survives;
//   - new emails enter as needsAction — a caller never sets another person's
//     RSVP;
//   - emails absent from the intent are removed.
// Provider order is preserved for retained entries and new entries append in
// intent order. Pure on purpose: a Google patch replaces the WHOLE attendees
// array, so a merge bug silently uninvites people — this must stay
// table-testable in isolation.
export function mergeAttendees(
  intended: ReadonlyArray<Pick<Attendee, "email" | "displayName">>,
  providerCurrent: readonly Attendee[],
): readonly Attendee[] {
  const intendedEmails = new Set(
    intended.map(({ email }) => email.toLowerCase()),
  );
  const currentEmails = new Set(
    providerCurrent.map(({ email }) => email.toLowerCase()),
  );
  const retained = providerCurrent.filter(({ email }) =>
    intendedEmails.has(email.toLowerCase()),
  );
  const added = intended
    .filter(({ email }) => !currentEmails.has(email.toLowerCase()))
    .map(({ email, displayName }) => ({
      email,
      displayName,
      responseStatus: "needsAction" as const,
    }));
  return [...retained, ...added];
}

// Null is a write-command "clear" signal. Stored/read rows omit the field;
// persisting null fails SyncEventInstance validation on list.
export function omitNullColor(content: SyncEventContent): SyncEventContent {
  if (content.color !== null) return content;
  const { color: _color, ...rest } = content;
  return rest;
}
