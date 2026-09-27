import { queryClient } from "@web/api/query-client";
import { useSession } from "@web/auth/compass/session/useSession";
import {
  clearAnonymousCalendarChangeSignUpPrompt,
  markUserAsAuthenticated,
} from "@web/auth/compass/state/auth.state.util";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import { syncPendingLocalEvents } from "@web/auth/providers/connection-revoked.util";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { refreshEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { createUseCompleteAuthentication } from "./useCompleteAuthentication.factory";

export const useCompleteAuthenticationImpl = createUseCompleteAuthentication({
  clearAnonymousCalendarChangeSignUpPrompt,
  markUserAsAuthenticated,
  // Local events just synced to the cloud; flip the source to "remote" and drop
  // the local cache entries so the next fetch reads from the backend.
  onEventSourceChanged: () => {
    refreshEventRepositorySource(true);
    queryClient.removeQueries({ queryKey: eventQueryKeys.all });
  },
  refreshUserMetadata,
  syncPendingLocalEvents,
  useSession,
});
