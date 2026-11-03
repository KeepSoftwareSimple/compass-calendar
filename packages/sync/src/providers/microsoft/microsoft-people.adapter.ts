import { MICROSOFT_SCOPE_PEOPLE_READ } from "@core/providers/microsoft.scopes";
import {
  CONTACT_SUGGESTION_MAX_RESULTS,
  type ContactSuggestion,
} from "@core/types/contact.contracts";
import {
  microsoftFailureCause,
  microsoftStatus,
} from "@sync/providers/microsoft/microsoft-error";
import { microsoftGraphRequest } from "@sync/providers/microsoft/microsoft-graph-request";
import { MICROSOFT_GRAPH_BASE_URL } from "@sync/providers/microsoft/microsoft-http.constants";
import {
  rankContactSuggestions,
  toContactSuggestion,
} from "@sync/providers/provider-contact-suggestions";
import {
  type ContactsPort,
  type ContactsSearchError,
  type ContactsSearchInput,
  type ContactsSearchSources,
} from "@sync/providers/provider-contacts.port";
import { classifyContactsSearchError } from "@sync/providers/provider-contacts-error";

export interface GraphScoredEmailAddress {
  readonly address?: string | null;
  readonly relevanceScore?: number | null;
}

export interface GraphPersonMatch {
  readonly displayName?: string | null;
  readonly scoredEmailAddresses?: readonly GraphScoredEmailAddress[] | null;
}

export interface MicrosoftPeopleSearchPage {
  readonly value: readonly GraphPersonMatch[];
}

export interface MicrosoftPeopleApi {
  searchPeople(params: {
    query: string;
    top: number;
    select: string;
  }): Promise<MicrosoftPeopleSearchPage>;
}

export type MicrosoftPeopleApiFactory = (
  accessToken: string,
) => MicrosoftPeopleApi;

const PEOPLE_SELECT = "displayName,scoredEmailAddresses";

const defaultApiFactory: MicrosoftPeopleApiFactory = (accessToken) =>
  new FetchMicrosoftPeopleApi(accessToken);

export class MicrosoftPeopleAdapter implements ContactsPort {
  #makeApi: MicrosoftPeopleApiFactory;

  constructor(makeApi: MicrosoftPeopleApiFactory = defaultApiFactory) {
    this.#makeApi = makeApi;
  }

  // Graph serves saved and interacted-with people from one `/me/people` call
  // behind one scope, so there is no separate "other contacts" surface.
  sourcesForGrantedScopes(granted: ReadonlySet<string>): ContactsSearchSources {
    return {
      contacts: granted.has(MICROSOFT_SCOPE_PEOPLE_READ),
      otherContacts: false,
    };
  }

  async searchContacts(
    input: ContactsSearchInput,
  ): Promise<ContactSuggestion[]> {
    if (!input.sources.contacts) return [];

    const api = this.#makeApi(input.accessToken);
    let page: MicrosoftPeopleSearchPage;
    try {
      page = await api.searchPeople({
        query: input.query,
        top: CONTACT_SUGGESTION_MAX_RESULTS,
        select: PEOPLE_SELECT,
      });
    } catch (error) {
      throw toContactsSearchError(error);
    }

    const candidates = page.value.flatMap((person) => toSuggestions(person));
    return rankContactSuggestions(candidates, input.query).slice(
      0,
      CONTACT_SUGGESTION_MAX_RESULTS,
    );
  }
}

class FetchMicrosoftPeopleApi implements MicrosoftPeopleApi {
  #accessToken: string;

  constructor(accessToken: string) {
    this.#accessToken = accessToken;
  }

  async searchPeople(params: {
    query: string;
    top: number;
    select: string;
  }): Promise<MicrosoftPeopleSearchPage> {
    const query = new URLSearchParams({
      $search: `"${params.query}"`,
      $select: params.select,
      $top: String(params.top),
    });
    const data = await microsoftGraphRequest<{
      value?: GraphPersonMatch[];
    }>({
      accessToken: this.#accessToken,
      url: `${MICROSOFT_GRAPH_BASE_URL}/me/people?${query}`,
      headers: { ConsistencyLevel: "eventual" },
      fallbackError: "microsoft_people_search_failed",
    });

    return { value: data.value ?? [] };
  }
}

// Graph returns each person's addresses with a relevance score; take them
// most-relevant first so equal-ranking candidates keep Graph's own ordering.
function toSuggestions(person: GraphPersonMatch): ContactSuggestion[] {
  const addresses = [...(person.scoredEmailAddresses ?? [])].sort(
    (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0),
  );
  return addresses
    .map((entry) => toContactSuggestion(entry.address, person.displayName))
    .filter((suggestion) => suggestion !== null);
}

function toContactsSearchError(error: unknown): ContactsSearchError {
  return classifyContactsSearchError(error, {
    status: microsoftStatus,
    cause: microsoftFailureCause,
    isRateLimited: (_err, status) => status === 429,
    rateLimitedMessage: "Microsoft throttled the contact search",
    unauthorizedMessage:
      "Microsoft refused the contact search credential or scope",
  });
}
