import { queryClient } from "@web/api/query-client";
import {
  applyUserMetadataSideEffects,
  refreshUserMetadata,
} from "@web/auth/compass/user/util/user-metadata.util";
import { handleConnectionRevoked } from "@web/auth/providers/connection-revoked.util";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { invalidateEventQueriesUnlessMutating } from "@web/events/queries/event.query.invalidation";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { onServerMessage } from "../client/sse.client";
import { createUseSyncSSE } from "./useSyncSSE.factory";

export const useSyncSSE = createUseSyncSSE({
  handleConnectionRevoked,
  invalidateEventQueries: () =>
    invalidateEventQueriesUnlessMutating(queryClient, eventQueryKeys.all),
  onServerMessage,
  refreshUserMetadata,
  setUserMetadata: (metadata) => {
    userMetadataActions.set(metadata);
    applyUserMetadataSideEffects(metadata);
  },
  showErrorToast,
});
