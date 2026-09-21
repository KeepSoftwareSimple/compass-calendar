import { z } from "zod/v4";

// HTTP responses (and nested objects they contain) use z.object so a rolling
// deploy cannot 502 on a field the other side has not seen yet. Request
// bodies, command payloads, and upserts stay z.strictObject.

// Contact-suggestion vocabulary for the attendee field's type-ahead. The wire
// shape deliberately carries ONLY what that field renders — an email to invite
// and a display name — never photos, phone numbers, metadata, or any other
// People API field. Everything else Google returns is dropped at the adapter
// boundary, and unknown keys here are stripped so a rolling deploy cannot 502
// on a field the other side has not seen yet.

// Queries shorter than this return an empty result WITHOUT a provider call:
// one character matches half an address book, burns People API quota, and the
// UI cannot rank it usefully.
export const CONTACT_SUGGESTION_QUERY_MIN_LENGTH = 2;
// Generous bound for a typed prefix; anything longer is a malformed request,
// not a search.
export const CONTACT_SUGGESTION_QUERY_MAX_LENGTH = 256;
// Upper bound on a suggestion page. The People search endpoints cap their own
// pages at 30; a type-ahead needs far fewer.
export const CONTACT_SUGGESTION_MAX_RESULTS = 10;

export const ContactSuggestionSchema = z.object({
  email: z.string().trim().min(1).max(320),
  displayName: z.string().trim().min(1).max(256).nullable(),
});
export type ContactSuggestion = z.infer<typeof ContactSuggestionSchema>;

export const ContactSuggestionsResponseSchema = z.object({
  suggestions: z
    .array(ContactSuggestionSchema)
    .max(CONTACT_SUGGESTION_MAX_RESULTS)
    .readonly(),
});
export type ContactSuggestionsResponse = z.infer<
  typeof ContactSuggestionsResponseSchema
>;
