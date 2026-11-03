import { people } from "@googleapis/people";
import { OAuth2Client } from "google-auth-library";
import {
  GOOGLE_SCOPE_CONTACTS_OTHER_READONLY,
  GOOGLE_SCOPE_CONTACTS_READONLY,
} from "@core/providers/google.scopes";
import {
  CONTACT_SUGGESTION_MAX_RESULTS,
  type ContactSuggestion,
} from "@core/types/contact.contracts";
import {
  googleFailureCause,
  googleStatus,
  hasGoogleRateLimitReason,
} from "@sync/providers/google/google-error";
import { GOOGLE_REQUEST_TIMEOUT_MS } from "@sync/providers/google/google-http.constants";
import {
  rankContactSuggestions,
  toContactSuggestion,
} from "@sync/providers/provider-contact-suggestions";
import {
  type ContactsPort,
  type ContactsSearchError,
  type ContactsSearchInput,
  type ContactsSearchSources,
  hasGrantedContactsSource,
} from "@sync/providers/provider-contacts.port";
import { classifyContactsSearchError } from "@sync/providers/provider-contacts-error";

// One People search match, narrowed to the two fields suggestions are allowed
// to carry. Everything else a Person holds (photos, phones, metadata) is
// dropped at this boundary and never enters Sync.
export interface GooglePeoplePersonMatch {
  readonly person?: {
    readonly names?: ReadonlyArray<{
      readonly displayName?: string | null;
      readonly metadata?: { readonly primary?: boolean | null } | null;
    }> | null;
    readonly emailAddresses?: ReadonlyArray<{
      readonly value?: string | null;
      readonly metadata?: { readonly primary?: boolean | null } | null;
    }> | null;
  } | null;
}

export interface GooglePeopleSearchPage {
  readonly results: readonly GooglePeoplePersonMatch[];
}

// The two People calls the adapter makes, one per contacts surface. Depending
// on this narrow interface (not the concrete googleapis client) lets tests
// supply scripted results without a network round-trip or module mocking.
export interface GooglePeopleApi {
  // Saved contacts (`people.searchContacts`, requires contacts.readonly).
  searchContacts(params: {
    query: string;
    pageSize: number;
    readMask: string;
  }): Promise<GooglePeopleSearchPage>;
  // Interacted-with addresses (`otherContacts.search`, requires
  // contacts.other.readonly).
  searchOtherContacts(params: {
    query: string;
    pageSize: number;
    readMask: string;
  }): Promise<GooglePeopleSearchPage>;
}

// Built per-request from a short-lived access token minted by credential
// custody; the token is set as the OAuth client's credential, never logged.
// Mirrors GoogleOAuthClientFactory / GoogleEventListApiFactory.
export type GooglePeopleApiFactory = (accessToken: string) => GooglePeopleApi;

// Only the fields the suggestion shape uses — asking for more would pull
// contact data Sync has no business holding.
const PEOPLE_READ_MASK = "names,emailAddresses";

const defaultApiFactory: GooglePeopleApiFactory = (accessToken) => {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const client = people({
    version: "v1",
    auth,
    timeout: GOOGLE_REQUEST_TIMEOUT_MS,
  });
  return {
    async searchContacts({ query, pageSize, readMask }) {
      const { data } = await client.people.searchContacts({
        query,
        pageSize,
        readMask,
      });
      return { results: data.results ?? [] };
    },
    async searchOtherContacts({ query, pageSize, readMask }) {
      const { data } = await client.otherContacts.search({
        query,
        pageSize,
        readMask,
      });
      return { results: data.results ?? [] };
    },
  };
};

// Google implementation of the contacts port. Queries ONLY the People surfaces
// the caller's granted scopes allow, merges both result sets, ranks them by
// how directly they match the typed prefix, and de-duplicates by email. The
// output carries email + displayName and nothing else.
export class GooglePeopleAdapter implements ContactsPort {
  #makeApi: GooglePeopleApiFactory;

  constructor(makeApi: GooglePeopleApiFactory = defaultApiFactory) {
    this.#makeApi = makeApi;
  }

  // Google guards each People surface with its own scope, and a partial grant
  // (one of the two) is a normal state the search handles.
  sourcesForGrantedScopes(granted: ReadonlySet<string>): ContactsSearchSources {
    return {
      contacts: granted.has(GOOGLE_SCOPE_CONTACTS_READONLY),
      otherContacts: granted.has(GOOGLE_SCOPE_CONTACTS_OTHER_READONLY),
    };
  }

  async searchContacts(
    input: ContactsSearchInput,
  ): Promise<ContactSuggestion[]> {
    // Nothing granted, nothing to query — don't even build a client.
    if (!hasGrantedContactsSource(input.sources)) return [];

    const api = this.#makeApi(input.accessToken);
    const params = {
      query: input.query,
      pageSize: CONTACT_SUGGESTION_MAX_RESULTS,
      readMask: PEOPLE_READ_MASK,
    };

    // Saved contacts first: they are the stronger signal, and rankSuggestions
    // preserves this order among equal ranks.
    const calls: Array<Promise<GooglePeopleSearchPage>> = [];
    if (input.sources.contacts) calls.push(api.searchContacts(params));
    if (input.sources.otherContacts)
      calls.push(api.searchOtherContacts(params));

    let pages: GooglePeopleSearchPage[];
    try {
      pages = await Promise.all(calls);
    } catch (error) {
      throw toContactsSearchError(error);
    }

    const candidates = pages.flatMap((page) =>
      page.results.flatMap((match) => toSuggestions(match)),
    );
    return rankContactSuggestions(candidates, input.query).slice(
      0,
      CONTACT_SUGGESTION_MAX_RESULTS,
    );
  }
}

// Map one matched person to suggestion candidates — one per usable email
// address, primary first, each carrying the person's primary display name.
function toSuggestions(match: GooglePeoplePersonMatch): ContactSuggestion[] {
  const person = match.person;
  if (!person) return [];

  const names = person.names ?? [];
  const displayName =
    names.find((name) => name.metadata?.primary)?.displayName ??
    names[0]?.displayName ??
    null;

  const addresses = [...(person.emailAddresses ?? [])].sort(
    (a, b) =>
      Number(b.metadata?.primary ?? false) -
      Number(a.metadata?.primary ?? false),
  );
  return addresses
    .map((address) => toContactSuggestion(address.value, displayName))
    .filter((suggestion) => suggestion !== null);
}

function toContactsSearchError(error: unknown): ContactsSearchError {
  return classifyContactsSearchError(error, {
    status: googleStatus,
    cause: googleFailureCause,
    isRateLimited: (err, status) =>
      status === 429 || hasGoogleRateLimitReason(err),
    rateLimitedMessage: "Google throttled the contact search",
    unauthorizedMessage:
      "Google refused the contact search credential or scope",
  });
}
