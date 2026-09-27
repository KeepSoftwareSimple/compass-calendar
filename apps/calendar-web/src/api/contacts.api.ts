import {
  type ContactSuggestionsResponse,
  ContactSuggestionsResponseSchema,
} from "@core/types/contact.contracts";
import { BaseApi } from "@web/api/base/base.api";

const ContactsApi = {
  // Google-contact suggestions for the attendee type-ahead. The backend
  // proxies sync and degrades every provider-side failure to an empty list,
  // so a non-2xx here is exceptional (auth loss, malformed query). Never log
  // the query or the response — suggestion content stays out of every log.
  async getSuggestions(
    query: string,
    signal?: AbortSignal,
  ): Promise<ContactSuggestionsResponse> {
    const response = await BaseApi.get<ContactSuggestionsResponse>(
      `/contacts/suggestions?q=${encodeURIComponent(query)}`,
      { signal },
    );

    return ContactSuggestionsResponseSchema.parse(response.data);
  },
};

export { ContactsApi };
