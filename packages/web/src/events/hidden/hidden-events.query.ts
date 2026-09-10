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
import { HiddenEventsApi } from "@web/events/hidden/hidden-events.api";
import {
  readHiddenEventIds,
  writeHiddenEventIds,
} from "@web/events/hidden/hidden-events.storage";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";

export const HIDDEN_EVENT_FAILURE_MESSAGE =
  "Couldn't update event visibility. The change was undone.";

export const hiddenEventsQueryKeys = {
  all: ["hidden-events"] as const,
  source: (source: EventRepositorySource) => ["hidden-events", source] as const,
};

export const EMPTY_HIDDEN_EVENT_IDS: ReadonlySet<string> = Object.freeze(
  new Set<string>(),
);

const hiddenEventIdSetCache = new WeakMap<
  readonly string[],
  ReadonlySet<string>
>();

function selectHiddenEventIdSet(ids: readonly string[]): ReadonlySet<string> {
  let cached = hiddenEventIdSetCache.get(ids);
  if (!cached) {
    cached = new Set(ids);
    hiddenEventIdSetCache.set(ids, cached);
  }
  return cached;
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

export function useToggleEventHidden(): (eventId: string) => void {
  const source = useEventRepositorySource();
  const queryClient = useQueryClient();
  const queryKey = hiddenEventsQueryKeys.source(source);

  const mutation = useMutation({
    mutationFn: async (
      input: SetEventHiddenInput,
    ): Promise<readonly string[]> => {
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot =
        queryClient.getQueryData<readonly string[]>(queryKey) ?? [];
      queryClient.setQueryData(
        queryKey,
        withHiddenEventId(snapshot, input.eventId, input.hidden),
      );
      return { snapshot };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.snapshot ?? []);
      showErrorToast(HIDDEN_EVENT_FAILURE_MESSAGE);
    },
    onSuccess: (list) => {
      queryClient.setQueryData(queryKey, list);
    },
  });

  return useCallback(
    (eventId: string) => {
      const current =
        queryClient.getQueryData<readonly string[]>(queryKey) ?? [];
      const input = SetEventHiddenInputSchema.parse({
        eventId,
        hidden: !current.includes(eventId),
      });
      mutation.mutate(input);
    },
    [mutation, queryClient, queryKey],
  );
}
