import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
  type SetEventHiddenInput,
  SetEventHiddenInputSchema,
} from "@core/types/event-visibility.contracts";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { EMPTY_HIDDEN_EVENT_IDS } from "@web/events/hidden/hidden-event-id";
import { HiddenEventsApi } from "@web/events/hidden/hidden-events.api";
import {
  readHiddenEventIds,
  writeHiddenEventIds,
} from "@web/events/hidden/hidden-events.storage";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import {
  isRestoringHistory,
  type UndoHistoryEntry,
  undoHistoryActions,
} from "@web/events/stores/undo.store";

export const HIDDEN_EVENT_FAILURE_MESSAGE =
  "Couldn't update event visibility. The change was undone.";

export const hiddenEventsQueryKeys = {
  all: ["hidden-events"] as const,
  source: (source: EventRepositorySource) => ["hidden-events", source] as const,
};

function selectHiddenEventIdSet(ids: readonly string[]): ReadonlySet<string> {
  return new Set(ids);
}

function withHiddenEventId(
  ids: readonly string[],
  eventId: string,
  hidden: boolean,
): readonly string[] {
  if (hidden) {
    return ids.includes(eventId) ? ids : [...ids, eventId];
  }
  return ids.filter((id) => id !== eventId);
}

export function hiddenEventsQueryOptions(source: EventRepositorySource) {
  return queryOptions({
    queryKey: hiddenEventsQueryKeys.source(source),
    queryFn: (): Promise<readonly string[]> | readonly string[] =>
      source === "remote" ? HiddenEventsApi.list() : readHiddenEventIds(),
    staleTime: 60_000,
  });
}

export function useHiddenEventIds(): ReadonlySet<string> {
  const source = useEventRepositorySource();
  const { data } = useQuery({
    ...hiddenEventsQueryOptions(source),
    select: selectHiddenEventIdSet,
  });

  return data ?? EMPTY_HIDDEN_EVENT_IDS;
}

type HiddenMutationVariables = SetEventHiddenInput & {
  undoEntry?: Extract<UndoHistoryEntry, { kind: "hidden" }>;
};

export function useToggleEventHidden(): {
  setEventHidden: (eventId: string, hidden: boolean) => void;
  toggleEventHidden: (eventId: string) => void;
} {
  const source = useEventRepositorySource();
  const queryClient = useQueryClient();
  const queryKey = hiddenEventsQueryKeys.source(source);

  const mutation = useMutation({
    mutationFn: async ({
      eventId,
      hidden,
    }: HiddenMutationVariables): Promise<readonly string[]> => {
      const input = SetEventHiddenInputSchema.parse({ eventId, hidden });
      if (source === "remote") {
        return HiddenEventsApi.set(input);
      }

      const next = withHiddenEventId(
        readHiddenEventIds(),
        input.eventId,
        input.hidden,
      );
      writeHiddenEventIds(next);
      return next;
    },
    onMutate: async ({ eventId, hidden }) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot =
        queryClient.getQueryData<readonly string[]>(queryKey) ?? [];
      queryClient.setQueryData(
        queryKey,
        withHiddenEventId(snapshot, eventId, hidden),
      );
      return { snapshot };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.snapshot ?? []);
      showErrorToast(HIDDEN_EVENT_FAILURE_MESSAGE, {
        options: { role: "alert" },
      });
    },
    onSuccess: (list, variables) => {
      queryClient.setQueryData(queryKey, list);
      if (variables.undoEntry) {
        undoHistoryActions.record(variables.undoEntry);
      }
    },
  });

  const setEventHidden = useCallback(
    (eventId: string, hidden: boolean) => {
      const input = SetEventHiddenInputSchema.parse({ eventId, hidden });
      mutation.mutate({
        ...input,
        undoEntry: isRestoringHistory()
          ? undefined
          : { kind: "hidden", eventId: input.eventId, hidden: input.hidden },
      });
    },
    [mutation],
  );

  const toggleEventHidden = useCallback(
    (eventId: string) => {
      const current =
        queryClient.getQueryData<readonly string[]>(queryKey) ?? [];
      setEventHidden(eventId, !current.includes(eventId));
    },
    [queryClient, queryKey, setEventHidden],
  );

  return { setEventHidden, toggleEventHidden };
}
