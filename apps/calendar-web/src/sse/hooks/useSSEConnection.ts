import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import { useUser } from "@web/auth/compass/user/hooks/useUser";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { closeStream, onStreamReopen, openStream } from "../client/sse.client";

const invalidateScheduleQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  void queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: calendarQueryKeys.all });
};

const reconcileAfterStreamGap = (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  invalidateScheduleQueries(queryClient);
  // A reopened stream means missed invalidations; events+calendars already
  // refetch, metadata is the third leg.
  void refreshUserMetadata({ force: true });
};

export const useSSEConnection = () => {
  const { authenticated } = useSession();
  const { userId } = useUser();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!(authenticated || userId)) {
      closeStream();
      return;
    }

    openStream();
    // Open and native reconnect can both follow a disconnect gap.
    reconcileAfterStreamGap(queryClient);
    return onStreamReopen(() => {
      reconcileAfterStreamGap(queryClient);
    });
  }, [authenticated, userId, queryClient]);
};
