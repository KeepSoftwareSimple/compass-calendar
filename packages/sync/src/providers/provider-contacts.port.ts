import { type ContactSuggestion } from "@core/types/contact.contracts";
import { ProviderError } from "@sync/providers/provider-error";

// Which provider contact surfaces the caller's granted scopes allow. The route
// derives this from the connection credential's granted scopes so the adapter
// never queries an API the user did not consent to — a partial grant (one of
// the two contacts scopes) is a normal state, not an error.
export interface ContactsSearchSources {
  // Saved contacts (Google: People API `people.searchContacts`,
  // `contacts.readonly`).
  readonly contacts: boolean;
  // Interacted-with-but-never-saved addresses (Google: People API
  // `otherContacts.search`, `contacts.other.readonly`).
  readonly otherContacts: boolean;
}

export interface ContactsSearchInput {
  // Short-lived access token minted by credential custody; set on the request
  // client and never logged.
  readonly accessToken: string;
  // The typed prefix to match. The caller enforces the minimum length; the
  // adapter passes it through verbatim.
  readonly query: string;
  readonly sources: ContactsSearchSources;
}

// A provider-neutral, read-only contact-suggestion port. Deliberately narrow:
// one search that returns ranked {email, displayName} pairs and nothing else —
// no listing, no profile detail, no write surface. Sync owns all provider code,
// so this port is how the suggestions route reaches the People API without
// knowing it exists.
export interface ContactsPort {
  // Which of this provider's contact surfaces the granted scopes unlock. The
  // adapter owns this mapping because only it knows which scope guards which
  // API; the route passes the credential's scopes and never names a provider.
  sourcesForGrantedScopes(granted: ReadonlySet<string>): ContactsSearchSources;
  searchContacts(input: ContactsSearchInput): Promise<ContactSuggestion[]>;
}

// True when at least one surface is open, i.e. a search can return something.
export const hasGrantedContactsSource = (
  sources: ContactsSearchSources,
): boolean => sources.contacts || sources.otherContacts;

// Why a contact search failed. Callers map these to transport responses; none
// of them ever carries contact content in its message or cause.
export type ContactsSearchErrorReason =
  // The provider throttled the call (429 / quota reasons). Retryable: the
  // caller should back off and try again, not fail the connection.
  | "rateLimited"
  // The provider rejected the credential or the scope at call time.
  | "unauthorized"
  // Transient or unclassified failure (5xx, network, malformed response).
  | "searchFailed";

export class ContactsSearchError extends ProviderError<ContactsSearchErrorReason> {}
