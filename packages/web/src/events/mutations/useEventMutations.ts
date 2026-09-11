import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  DateTimeSchema,
  type EventId,
  EventIdSchema,
} from "@core/types/domain-primitives";
import {
  type Event,
  type EventRecurrence,
  type EventSchedule,
} from "@core/types/event.contracts";
import {
  type Attendee,
  type AttendeeInput,
  type RsvpResponseStatus,
} from "@core/types/event-attendance.contracts";
import {
  type CreateEventInput,
  type RecurrenceScope,
  type ReplaceEventInput,
  type RsvpEventInput,
} from "@core/types/event-command.contracts";
import { shiftSeriesScheduleByOccurrenceEdit } from "@core/util/event/shift-series-schedule-by-occurrence-edit";
import { decodeOccurrenceId } from "@core/util/occurrence-id";
import { getApiErrorCode, isApiError } from "@web/api/util/api.util";
import { track } from "@web/auth/posthog/track";
import { connectionProviderKind } from "@web/auth/providers/connection-provider.util";
import { isCalendarReconnectRequired } from "@web/auth/providers/reconnect.calendar";
import {
  selectGoogleSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { billingQueryKeys } from "@web/billing/billing.query";
import { billingPreviewActions } from "@web/billing/billing-preview.store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import {
  buildCalendarLookup,
  isEventReadOnly,
} from "@web/calendars/useCalendarLookup";
import { handleError } from "@web/common/utils/event/event.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { showGoogleReconnectToast } from "@web/common/utils/toast/google-reconnect.toast";
import {
  dismissRecurrenceScopeToast,
  dismissRecurrenceScopeToastFor,
  showRecurrenceScopeSuccessToast,
} from "@web/common/utils/toast/recurrence-scope.toast";
import { noteFirstRealEventCreated } from "@web/components/FirstEventPrompt/first-event.store";
import { EventApi } from "@web/events/event.api";
import { editableContent } from "@web/events/grid-event-draft.adapter";
import { eventSchedulesEqual } from "@web/events/mutations/event-schedule-equal";
import {
  applyEventProjectionAcrossQueries,
  eventBelongsToEntry,
  findEventInCache,
  findSeriesEventsInCache,
  getEventQueryEntries,
  insertEventIntoQueries,
  isEventQueryKey,
  patchEventInQueries,
  removeEventFromQueries,
  upsertEventAcrossQueries,
} from "@web/events/queries/event.query.cache";
import {
  flushOwedEventInvalidation,
  invalidateAllEventQueries,
  markEventInvalidationOwed,
} from "@web/events/queries/event.query.invalidation";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import {
  projectRecurringDelete,
  projectRecurringEdit,
  projectSeriesMaterialization,
  projectSeriesRulesChange,
} from "@web/events/recurrence/projectRecurringEdit";
import {
  isRecurrenceScopeEditAskDeclined,
  type RecurrenceScopeOpportunity,
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { type EventRepository } from "@web/events/repositories/event.repository.types";
import { getEventRepositoryBySource } from "@web/events/repositories/event.repository.util";
import {
  isRestoringHistory,
  undoHistoryActions,
} from "@web/events/stores/undo.store";
import {
  type EventMutationOperation,
  eventMutationKeys,
} from "./event.mutation.keys";
import {
  hasOtherPendingWriteForKey,
  isSupersededByLaterEditWrite,
  markAnonymousEventWrite,
  type PrecedingEventWrites,
  precedingCreateOk,
  precedingDeleteOk,
  showAnonymousSaveToastIfEligible,
  waitForPrecedingEventWrites,
} from "./event.mutation.runtime";
import {
  recordEventCreateHistory,
  recordEventDeleteHistory,
  recordEventEditHistory,
} from "./event.mutation-history";

type EventMutationContext = {
  previousQueries: Array<[QueryKey, unknown]>;
};

function restoreWriteKeyFromSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  writeKey: EventId,
  previousQueries: Array<[QueryKey, unknown]>,
) {
  const snapByKey = new Map(
    previousQueries.map(([queryKey, data]) => [
      JSON.stringify(queryKey),
      data as NormalizedEventQueryData | undefined,
    ]),
  );

  for (const [
    queryKey,
    current,
  ] of queryClient.getQueriesData<NormalizedEventQueryData>({
    queryKey: eventQueryKeys.all,
  })) {
    if (!current || !isEventQueryKey(queryKey)) continue;
    const snap = snapByKey.get(JSON.stringify(queryKey));
    const snapEvent = snap?.entities[writeKey];
    const currentEvent = current.entities[writeKey];
    if (!snapEvent && !currentEvent) continue;

    const entities = { ...current.entities };
    let ids = [...current.ids];
    if (snapEvent) {
      entities[writeKey] = snapEvent;
      if (!ids.includes(writeKey)) ids = [...ids, writeKey];
    } else {
      delete entities[writeKey];
      ids = ids.filter((candidate) => candidate !== writeKey);
    }
    // Preserve optional fields like demoEventIds on the query payload.
    queryClient.setQueryData(queryKey, { ...current, ids, entities });
  }
}

const nowDateTime = () => DateTimeSchema.parse(new Date().toISOString());

// An occurrence's series is its own recurrence pointer; the series base's
// series is itself. Shared by the replace and delete optimistic callbacks,
// which both need the series id to gather every cached instance.
function seriesIdOf(event: Event | null | undefined): EventId | null {
  if (event?.recurrence.kind === "occurrence") return event.recurrence.seriesId;
  if (event?.recurrence.kind === "series") return event.id;
  return null;
}

// Remote/sync treat scope-"all" schedule as the series master. The client
// still sends an occurrence's absolute schedule (same shape local IndexedDB
// rebases in replaceSeries), so rebase onto a pre-optimistic master snapshot
// before submit. Snapshotting matters: optimistic rules edits can rewrite the
// cached series row with the occurrence's absolute schedule before mutationFn
// runs. thisAndFollowing keeps the absolute schedule as remainder DTSTART.
// Local source skips this — LocalEventRepository already applies the delta.
function snapshotSeriesMasterSchedule(
  queryClient: ReturnType<typeof useQueryClient>,
  source: EventRepositorySource,
  id: EventId,
): EventSchedule | undefined {
  const parts = decodeOccurrenceId(id);
  if (!parts) return undefined;
  const master = findEventInCache(
    queryClient,
    EventIdSchema.parse(parts.eventId),
    source,
  );
  return master?.recurrence.kind === "series" ? master.schedule : undefined;
}

const SERIES_BASE_MISSING_MESSAGE =
  "This series is still loading. Reload the page and try again.";

// A remote scope-"all" edit addressed through an occurrence needs the series
// base to rebase the occurrence's dates onto. Without it the absolute dates
// would become the series start: sync moves the master to them and shifts
// every instance by the same distance. Checked BEFORE a mutation is queued,
// because a queued promotion coalesces the narrow write away and a failure
// after that point would lose both edits.
function isMissingSeriesBase(
  source: EventRepositorySource,
  scope: RecurrenceScope,
  id: EventId,
  seriesMasterSchedule: EventSchedule | undefined,
): boolean {
  return (
    source === "remote" &&
    scope === "all" &&
    decodeOccurrenceId(id) !== null &&
    seriesMasterSchedule === undefined
  );
}

function resolveRemoteReplaceSchedule(
  source: EventRepositorySource,
  id: EventId,
  input: ReplaceEventInput,
  seriesMasterSchedule: EventSchedule | undefined,
): ReplaceEventInput {
  if (source !== "remote" || input.scope !== "all") return input;

  const parts = decodeOccurrenceId(id);
  if (!parts) return input;
  // Backstop for the entry-point check above; never send absolute dates.
  if (!seriesMasterSchedule) throw new Error(SERIES_BASE_MISSING_MESSAGE);

  return {
    ...input,
    schedule: shiftSeriesScheduleByOccurrenceEdit(
      seriesMasterSchedule,
      parts.recurrenceId,
      input.schedule,
    ),
  };
}

// Replay flows (undo/redo, snapshot restore in useUndoRedo) deliberately
// funnel a full read-side Event["content"] through the write input type, so
// their attendee entries really carry responseStatus as excess structure; a
// genuine guest-edit input's entries never do. When building optimistic
// Event content, keep only real read-state entries: a replay restores its
// guest list without flicker exactly as before.
function readAttendees(
  attendees: CreateEventInput["content"]["attendees"],
): readonly Attendee[] | undefined {
  if (attendees === undefined) return undefined;
  const withStatus = attendees.filter(
    (attendee): attendee is Attendee => "responseStatus" in attendee,
  );
  return withStatus.length === attendees.length ? withStatus : undefined;
}

// The counterpart to readAttendees: a genuine guest edit (no entry carries
// responseStatus — see the wire boundary in grid-event-draft.adapter.ts).
function isGuestEditInput(
  attendees: CreateEventInput["content"]["attendees"],
): attendees is readonly AttendeeInput[] {
  return (
    attendees?.every((attendee) => !("responseStatus" in attendee)) ?? false
  );
}

// Optimistic read-shape for an intended guest list, mirroring sync's
// merge-by-email (WP-02) and the backend's synthesized response (WP-03):
// retained emails keep their current responseStatus/displayName, new emails
// enter as needsAction, dropped emails disappear. The settle refetch still
// owns the provider-confirmed list; a failed save rolls back through the
// snapshot restore like every other optimistic write.
function optimisticGuestList(
  intended: readonly AttendeeInput[],
  existing: readonly Attendee[] | undefined,
): readonly Attendee[] {
  const byEmail = new Map(
    (existing ?? []).map((attendee) => [
      attendee.email.toLowerCase(),
      attendee,
    ]),
  );
  return intended.map(
    (attendee) =>
      byEmail.get(attendee.email.toLowerCase()) ?? {
        email: attendee.email,
        displayName: attendee.displayName,
        responseStatus: "needsAction" as const,
      },
  );
}

// Optimistic RSVP: rewrite only the caller's own attendee entry (matched by
// the calendar's account email, case-insensitively — the same self-match sync
// applies), leaving every other guest's provider-owned status untouched.
// Events without a matching entry pass through unchanged.
function rsvpEventContent(
  event: Event,
  accountEmail: string,
  responseStatus: RsvpResponseStatus,
): Event {
  if (event.content.kind !== "details" || !event.content.attendees) {
    return event;
  }
  return {
    ...event,
    content: {
      ...event.content,
      attendees: event.content.attendees.map((attendee) =>
        attendee.email.toLowerCase() === accountEmail.toLowerCase()
          ? { ...attendee, responseStatus }
          : attendee,
      ),
    },
  };
}

// A create's optimistic insert needs a full Event before the server response
// lands; recurrence is a strict subset of EditableRecurrence ("single" |
// "series"), so it's assignable as-is.
function optimisticEventFromCreate(input: CreateEventInput): Event {
  const { attendees, ...details } = input.content;
  const optimisticAttendees = isGuestEditInput(attendees)
    ? optimisticGuestList(attendees, undefined)
    : readAttendees(attendees);
  return {
    id: input.id as EventId,
    calendarId: input.calendarId,
    content:
      optimisticAttendees === undefined
        ? details
        : { ...details, attendees: optimisticAttendees },
    schedule: input.schedule,
    recurrence: input.recurrence as EventRecurrence,
    createdAt: nowDateTime(),
    updatedAt: null,
  };
}

// The form only ever submits the editable subset (title/description/
// location/color/attendees) — organizer/conference stay read-only,
// provider-sourced fields the server never asks the client to resubmit.
// Merging input.content wholesale onto the optimistic cache entry would make
// those fields flicker away until the settle-time refetch restores them from
// the server.
function mergeReplaceContent(
  existing: Event["content"],
  input: ReplaceEventInput["content"],
): Event["content"] {
  // Same replay-vs-guest-edit split as optimisticEventFromCreate: read-state
  // attendee entries re-enter the optimistic cache as-is; a genuine guest
  // edit merges optimistically against the cached list (new guests render as
  // needsAction immediately and settle from sync).
  const { attendees, ...details } = input;
  const existingAttendees =
    existing.kind === "details" ? existing.attendees : undefined;
  const optimisticAttendees = isGuestEditInput(attendees)
    ? optimisticGuestList(attendees, existingAttendees)
    : readAttendees(attendees);
  const replayInput =
    optimisticAttendees === undefined
      ? details
      : { ...details, attendees: optimisticAttendees };
  if (existing.kind !== "details") return replayInput;
  // Slot writes (including null clear) supersede a provider custom hex on the
  // optimistic card. Palette resolution prefers colorHex over color, so keeping
  // the old hex would leave the prior fill until settle/refetch.
  if (replayInput.kind === "details" && replayInput.color !== undefined) {
    const { colorHex: _cleared, ...withoutHex } = existing;
    return { ...withoutHex, ...replayInput };
  }
  return { ...existing, ...replayInput };
}

function mergeReplaceInput(existing: Event, input: ReplaceEventInput): Event {
  const recurrence: EventRecurrence =
    input.recurrence.kind === "preserve"
      ? existing.recurrence
      : input.recurrence.kind === "series"
        ? { kind: "series", rules: input.recurrence.rules }
        : { kind: "single" };

  return {
    ...existing,
    calendarId: input.calendarId ?? existing.calendarId,
    content: mergeReplaceContent(existing.content, input.content),
    schedule: input.schedule,
    recurrence,
    updatedAt: nowDateTime(),
  };
}

// A series-scope replace ("all"/"thisAndFollowing") serializes against the
// series id, not the (arbitrary) instance id the edit was submitted through
// — otherwise concurrent edits to different instances of the same series
// wouldn't serialize against each other.
function seriesWriteKey(
  original: Event | null,
  scope: RecurrenceScope,
  fallbackId: EventId,
): EventId {
  if (scope === "this" || !original) return fallbackId;
  if (original.recurrence.kind === "occurrence") {
    return original.recurrence.seriesId;
  }
  return original.id;
}

type CreateVariables = {
  input: CreateEventInput;
  writeKey: EventId;
  callbacks?: EventMutationCallbacks;
};
type ReplaceVariables = {
  id: EventId;
  input: ReplaceEventInput;
  writeKey: EventId;
  originalOverride?: Event;
  // Captured before optimistic cache writes so remote scope-all rebasing
  // cannot read a master row that projectSeriesRulesChange already polluted
  // with the occurrence's absolute schedule.
  seriesMasterSchedule?: EventSchedule;
  opportunityId?: number;
  callbacks?: EventMutationCallbacks;
};
type DeleteVariables = {
  id: EventId;
  scope: RecurrenceScope;
  writeKey: EventId;
  skipRepository: boolean;
  originalOverride?: Event;
  opportunityId?: number;
};
type RsvpVariables = {
  id: EventId;
  input: RsvpEventInput;
  // The connected account answering — the self attendee entry is matched by
  // the calendar's account email, case-insensitively (same rule sync applies).
  accountEmail: string;
  writeKey: EventId;
};

export type RsvpPayload = {
  id: EventId;
  responseStatus: RsvpResponseStatus;
  scope: RsvpEventInput["scope"];
  accountEmail: string;
};

export type EventMutationCallbacks = {
  onSuccess?: () => void;
  onError?: () => void;
  onOptimisticApplied?: () => void;
};

export type EventMutations = {
  create: (input: CreateEventInput, callbacks?: EventMutationCallbacks) => void;
  replace: (
    payload: { id: EventId; input: ReplaceEventInput },
    callbacks?: EventMutationCallbacks,
  ) => boolean;
  delete: (payload: { id: EventId; scope: RecurrenceScope }) => void;
  rsvp: (payload: RsvpPayload) => void;
  promoteRecurring: (
    opportunity: RecurrenceScopeOpportunity,
    scope: "thisAndFollowing" | "all",
  ) => void;
};

export type EventMutationDependencies = {
  source?: EventRepositorySource;
  repository?: EventRepository;
  markWrite?: () => Promise<unknown>;
  reportError?: (error: Error) => void;
};

export function useEventMutations(
  dependencies: EventMutationDependencies = {},
): EventMutations {
  const queryClient = useQueryClient();
  const activeSource = useEventRepositorySource();
  const source = dependencies.source ?? activeSource;
  const repository = useMemo(
    () => dependencies.repository ?? getEventRepositoryBySource(source),
    [dependencies.repository, source],
  );
  const markWrite = dependencies.markWrite ?? markAnonymousEventWrite;
  const showAnonymousSaveToast =
    dependencies.markWrite === undefined
      ? showAnonymousSaveToastIfEligible
      : undefined;
  const reportError = dependencies.reportError ?? handleError;

  // Shared by the create and replace optimistic callbacks: the query-cache
  // ranges a series expansion should materialize instances into.
  const cachedRanges = () =>
    getEventQueryEntries(queryClient, { source }).map(({ metadata }) => ({
      start: metadata.start,
      end: metadata.end,
    }));

  // Backstop only - the real enforcement is the UI gates (cards, shortcuts,
  // context menu, form) that block a read-only mutation before it ever
  // reaches here (packet 08 step 8). Reads the calendars query's cache
  // snapshot directly via `queryClient.getQueryData` rather than calling
  // useCalendarLookup()/useCalendarsQuery() as hooks, which would pull in
  // useSession() as a new dependency this hook doesn't otherwise have -
  // this hook's existing test harness (useEventMutations.test.tsx) renders
  // it with a bare QueryClientProvider, no session/auth context. A cache
  // miss (calendars not fetched yet) resolves the same way an unresolved
  // calendarId does in isEventReadOnly - fails open as writable.
  //
  // useCallback (not a plain closure) so this has a referentially stable
  // identity across renders when `queryClient` doesn't change - the mutate
  // object below is memoized on it, and a fresh function reference every
  // render would recompute that memo on every render too.
  const isTargetReadOnly = useCallback(
    (event: Event | null): boolean => {
      if (!event) return false;
      const lookup = buildCalendarLookup(
        queryClient.getQueryData<Calendar[]>(calendarQueryKeys.all),
      );
      return isEventReadOnly(
        lookup,
        event.calendarId,
        event.content.kind === "busy",
      );
    },
    [queryClient],
  );

  const blockReconnectRequiredCalendar = useCallback(
    (calendarId: Event["calendarId"] | null | undefined): boolean => {
      if (!calendarId) return false;
      const calendars =
        queryClient.getQueryData<Calendar[]>(calendarQueryKeys.all) ?? [];
      const calendar = calendars.find((entry) => entry.id === calendarId);
      if (!calendar || !isCalendarReconnectRequired(calendar)) return false;

      const connection = selectGoogleSyncConnections(
        useUserMetadataStore.getState(),
      ).find(
        (entry) =>
          entry.accountEmail === calendar.accountEmail &&
          connectionProviderKind(entry) === calendar.provider,
      );
      showGoogleReconnectToast({
        connectionId: connection?.id,
        accountEmail: calendar.accountEmail,
        provider: calendar.provider === "local" ? undefined : calendar.provider,
      });
      console.warn(
        `[useEventMutations] blocked write on reconnect-required calendar ${calendarId}`,
      );
      return true;
    },
    [queryClient],
  );

  // Snapshot + conditional rollback: a failed mutation restores its pre-image.
  // Alone in flight → full query restore. Concurrent writes → restore only
  // entities owned by this writeKey so another event's optimistic update is
  // preserved. Settle-time invalidation still converges to server truth once
  // no event mutation remains in flight. Invalidation is deferred to a
  // macrotask because a settling mutation still counts as pending during its
  // own onSettled — deferring lets simultaneous settles reliably observe
  // count 0 instead of each seeing the other and skipping.
  //
  // The count>0 branch marks the invalidation OWED rather than dropping it.
  // Every mutation's onSettled runs this same function, so whichever one
  // finishes last will eventually observe count 0 and flush it — without
  // this, a settle whose deferred check raced a brand-new mutation starting
  // could silently never invalidate, leaving an edit/delete that already
  // failed server-side (or an SSE signal that arrived mid-burst) stuck
  // showing stale optimistic state until an unrelated refetch happened to
  // cover it.
  const settle = () => {
    setTimeout(() => {
      if (
        queryClient.isMutating({ mutationKey: eventMutationKeys.all }) === 0
      ) {
        invalidateAllEventQueries(queryClient);
        flushOwedEventInvalidation(queryClient);
      } else {
        markEventInvalidationOwed(queryClient);
      }
    }, 0);
  };
  const buildMutation = <Variables extends { writeKey: EventId }>(
    operation: EventMutationOperation,
    mutationFn: (variables: Variables) => Promise<unknown>,
    optimistic: (variables: Variables) => void,
  ) => ({
    mutationKey: eventMutationKeys.operation(operation),
    mutationFn,
    onMutate: async (variables: Variables): Promise<EventMutationContext> => {
      await queryClient.cancelQueries({ queryKey: eventQueryKeys.all });
      const previousQueries = queryClient.getQueriesData<unknown>({
        queryKey: eventQueryKeys.all,
      });
      optimistic(variables);
      // Callers that tear down their own pre-save UI (the event form's grid
      // draft) run it here so the teardown lands in the same task — and so
      // the same React commit — as the cache write. useBaseQuery recomputes
      // getOptimisticResult on every render, so the re-render the teardown
      // itself triggers already shows the inserted event: the grid never
      // paints a frame with neither the draft nor the saved card.
      const callbacks = (variables as { callbacks?: EventMutationCallbacks })
        .callbacks;
      callbacks?.onOptimisticApplied?.();
      return { previousQueries };
    },
    onError: (
      error: Error,
      variables: Variables,
      context: EventMutationContext | undefined,
    ) => {
      if (isApiError(error) && getApiErrorCode(error) === "BILLING_REQUIRED") {
        // The look-around ends at the moment of real intent: a refused write
        // brings the trial ask back.
        billingPreviewActions.exit();
        void queryClient.invalidateQueries({
          queryKey: billingQueryKeys.status,
        });
      }
      reportError(error);
      const opportunityId = (variables as { opportunityId?: number })
        .opportunityId;
      if (opportunityId) {
        // Complete before dismissing to prevent a synchronous onClose from
        // recording a decline on a failed save (which is not user intent).
        const opportunity =
          useRecurrenceScopeOpportunityStore.getState().opportunity;
        recurrenceScopeOpportunityActions.complete(opportunityId);
        if (opportunity?.id === opportunityId) {
          dismissRecurrenceScopeToastFor(opportunity);
        } else {
          dismissRecurrenceScopeToast(opportunityId);
        }
      }
      if (!context) return;
      // TanStack still counts *this* mutation as pending while onError runs
      // (it dispatches status "error" only afterwards), so isMutating === 1
      // means we are alone and a full snapshot restore is safe.
      const pendingEventMutations = queryClient.isMutating({
        mutationKey: eventMutationKeys.all,
      });
      if (pendingEventMutations <= 1) {
        for (const [queryKey, data] of context.previousQueries) {
          queryClient.setQueryData(queryKey, data);
        }
        return;
      }
      // Another mutation shares this write key (newer optimistic edit) — leave
      // the cache alone so we do not clobber it. Deletes wait for settle when
      // concurrent (recurring deletes touch more than writeKey). Different-key
      // create/replace concurrency restores only entities[writeKey].
      if (
        operation === "delete" ||
        hasOtherPendingWriteForKey(queryClient, variables.writeKey, variables)
      ) {
        return;
      }
      restoreWriteKeyFromSnapshot(
        queryClient,
        variables.writeKey,
        context.previousQueries,
      );
    },
    onSettled: settle,
  });
  // Shared by every mutationFn below: wait for earlier writes to the same
  // event to finish, run the repository write only if `canWrite` says the
  // preceding outcome allows it, then mark the write regardless.
  const writeAfterPreceding = async (
    writeKey: string,
    variables: unknown,
    canWrite: (preceding: PrecedingEventWrites) => boolean,
    write: () => Promise<unknown>,
    { coalesce = false }: { coalesce?: boolean } = {},
  ) => {
    const preceding = await waitForPrecedingEventWrites(
      queryClient,
      writeKey,
      variables,
    );
    // A newer edit for this event is already queued and will persist the final
    // state, so this write is redundant — skip the network call but still mark
    // the write (anon-change tracking) so a burst collapses to one request.
    if (
      coalesce &&
      isSupersededByLaterEditWrite(queryClient, writeKey, variables)
    ) {
      await markWrite();
      return;
    }
    const wrote = canWrite(preceding);
    if (wrote) await write();
    await markWrite();
    if (wrote) await showAnonymousSaveToast?.();
  };

  const createMutation = useMutation(
    buildMutation<CreateVariables>(
      "create",
      async (variables) => {
        // Undo-of-delete restores via create with the original id; waiting
        // here keeps the POST from landing before the DELETE server-side.
        // Normal creates use fresh ids and resolve immediately.
        await writeAfterPreceding(
          variables.writeKey,
          variables,
          precedingDeleteOk,
          // Wire boundary: strip to the editable subset here, not at the
          // callers (useUndoRedo replays a full cached Event's content on
          // purpose, to keep it for the optimistic insert above). This is
          // the one place every create funnels through, so it's the only
          // spot that needs to know the write schema is stricter than the
          // read shape.
          () =>
            repository.create({
              ...variables.input,
              content: editableContent(variables.input.content),
            }),
        );
        // Only past this point did the write actually land - a throw above
        // (network/validation failure) skips this, so a failed create never
        // retires the first-event prompt the way a genuine one does.
        if (!variables.input.restore) {
          noteFirstRealEventCreated();
        }
      },
      ({ input }) => {
        const event = optimisticEventFromCreate(input);
        // A recurring create's base is metadata-only (the grid filters
        // series bases), so expand its instances too or the event would be
        // invisible until the settle refetch.
        if (event.recurrence.kind === "series") {
          applyEventProjectionAcrossQueries(
            queryClient,
            projectSeriesMaterialization({
              base: event,
              ranges: cachedRanges(),
            }),
            source,
          );
          return;
        }
        insertEventIntoQueries(queryClient, event, (entry) =>
          eventBelongsToEntry(event, entry, source),
        );
      },
    ),
  );

  const replaceMutation = useMutation(
    buildMutation<ReplaceVariables>(
      "replace",
      async (variables) => {
        const input = resolveRemoteReplaceSchedule(
          source,
          variables.id,
          variables.input,
          variables.seriesMasterSchedule,
        );
        await writeAfterPreceding(
          variables.writeKey,
          // Must be the exact variables object mutate registered — a spread
          // clone cannot identify this mutation in the serialization queue.
          variables,
          precedingCreateOk,
          // Same wire-boundary strip as create, see its comment above.
          () =>
            repository.replace(variables.id, {
              ...input,
              content: editableContent(input.content),
            }),
          // A promotion replays the saved occurrence mutation at a broader
          // scope. It must reach the repository even if a later narrow edit
          // shares its occurrence write key. Undo/redo restores must also
          // always persist — coalescing would drop the replay.
          {
            coalesce: !variables.originalOverride && !variables.input.restore,
          },
        );
      },
      ({ id, input, originalOverride }) => {
        const existing =
          findEventInCache(queryClient, id, source) ?? originalOverride;
        if (!existing) return;
        const edited = mergeReplaceInput(existing, input);
        const original = originalOverride ?? existing;
        const seriesId = seriesIdOf(original);

        // (Re)defining recurrence rules changes which instances exist, so
        // shifting cached instances isn't enough: expand the new rules into
        // optimistic occurrences, mirroring the server's materialization.
        // Scope "this" on an occurrence keeps its occurrence recurrence
        // server-side, so it stays on the plain upsert path below.
        if (
          edited.recurrence.kind === "series" &&
          (input.scope !== "this" || existing.recurrence.kind !== "occurrence")
        ) {
          const currentBase =
            existing.recurrence.kind === "series"
              ? existing
              : seriesId
                ? findEventInCache(queryClient, seriesId, source)
                : null;
          const rulesChanged =
            currentBase?.recurrence.kind !== "series" ||
            currentBase.recurrence.rules.join("\n") !==
              edited.recurrence.rules.join("\n");

          if (rulesChanged) {
            applyEventProjectionAcrossQueries(
              queryClient,
              projectSeriesRulesChange({
                scope: input.scope,
                edited,
                original,
                seriesId,
                seriesEvents: seriesId
                  ? findSeriesEventsInCache(queryClient, seriesId, source)
                  : [],
                ranges: cachedRanges(),
              }),
              source,
            );
            return;
          }
        }

        if (seriesId && input.scope !== "this") {
          applyEventProjectionAcrossQueries(
            queryClient,
            projectRecurringEdit({
              scope: input.scope,
              edited,
              original,
              seriesEvents: findSeriesEventsInCache(
                queryClient,
                seriesId,
                source,
              ),
            }),
            source,
          );
          return;
        }
        // Upsert (not patch) so an event edited/dragged into a currently-cached
        // range it wasn't previously a member of renders optimistically, and
        // one dragged out of a range is removed from it.
        upsertEventAcrossQueries(
          queryClient,
          edited,
          (entry) => eventBelongsToEntry(edited, entry, source),
          { source },
        );
      },
    ),
  );

  const deleteMutation = useMutation(
    buildMutation<DeleteVariables>(
      "delete",
      async (variables) => {
        await writeAfterPreceding(
          variables.writeKey,
          variables,
          (preceding) =>
            !variables.skipRepository && precedingCreateOk(preceding),
          () => repository.delete(variables.id, variables.scope),
        );
      },
      ({ id, scope, originalOverride }) => {
        const existing =
          findEventInCache(queryClient, id, source) ?? originalOverride;
        const seriesId = seriesIdOf(originalOverride ?? existing);

        if (existing && seriesId && scope !== "this") {
          applyEventProjectionAcrossQueries(
            queryClient,
            projectRecurringDelete({
              scope,
              target: originalOverride ?? existing,
              seriesId,
              seriesEvents: findSeriesEventsInCache(
                queryClient,
                seriesId,
                source,
              ),
            }),
            source,
          );
          return;
        }
        removeEventFromQueries(queryClient, id, { source });
      },
    ),
  );

  // WP-08: answer an invitation. Goes straight to EventApi rather than the
  // repository — RSVP only exists for provider-backed events (the control is
  // hidden on local calendars), and it deliberately skips the read-only
  // target gate below: answering is allowed on viewer-access calendars
  // because it is not a calendar write. Rollback rides the shared snapshot
  // restore; the settle-time invalidation converges to the provider truth
  // (SSE eventsChanged lands on this same invalidation path).
  const rsvpMutation = useMutation(
    buildMutation<RsvpVariables>(
      "rsvp",
      (variables) => EventApi.rsvpEvent(variables.id, variables.input),
      ({ id, input, accountEmail }) => {
        const rewrite = (event: Event) =>
          rsvpEventContent(event, accountEmail, input.responseStatus);
        patchEventInQueries(queryClient, id, rewrite, { source });
        if (input.scope !== "all") return;
        // Series-wide answer: paint the master and every cached occurrence
        // too, so the user's dot doesn't flicker per-instance until settle.
        const existing = findEventInCache(queryClient, id, source);
        const parts = decodeOccurrenceId(id);
        const seriesId =
          seriesIdOf(existing) ??
          (parts ? EventIdSchema.parse(parts.eventId) : null);
        if (!seriesId) return;
        patchEventInQueries(queryClient, seriesId, rewrite, { source });
        for (const sibling of findSeriesEventsInCache(
          queryClient,
          seriesId,
          source,
        )) {
          patchEventInQueries(queryClient, sibling.id, rewrite, { source });
        }
      },
    ),
  );

  // Undo recording happens here at the `.mutate()` boundary: it's the one
  // place every caller funnels through and the cache still holds the
  // pre-mutation event. Replays from useUndoRedo set the restoring flag so
  // they don't record themselves.
  return useMemo(
    () => ({
      create: (input: CreateEventInput, callbacks?: EventMutationCallbacks) => {
        if (blockReconnectRequiredCalendar(input.calendarId)) {
          return;
        }
        const id = input.id ?? (createObjectIdString() as EventId);
        const finalInput = { ...input, id };
        recordEventCreateHistory({
          event: optimisticEventFromCreate(finalInput),
        });
        // `restore: true` marks an undo-of-delete or redo-of-create replay,
        // not a genuine user action - only count real creates.
        if (!finalInput.restore) {
          track("event_created", {
            event_source: source,
            recurrence:
              finalInput.recurrence.kind === "series" ? "series" : "single",
          });
        }
        // callbacks rides along in two places: inside the variables so
        // onMutate can run onOptimisticApplied in the same task as the cache
        // write, and as mutate options so onSuccess/onError still fire per
        // call (undo's restore toast depends on them).
        createMutation.mutate(
          {
            input: finalInput,
            writeKey: id,
            callbacks,
          },
          callbacks,
        );
      },
      replace: (
        payload: { id: EventId; input: ReplaceEventInput },
        callbacks?: EventMutationCallbacks,
      ): boolean => {
        const original = findEventInCache(queryClient, payload.id, source);
        if (isTargetReadOnly(original)) {
          console.warn(
            `[useEventMutations] blocked replace on read-only event ${payload.id}`,
          );
          return false;
        }
        if (
          original?.providerManaged === true &&
          !eventSchedulesEqual(original.schedule, payload.input.schedule)
        ) {
          showErrorToast(
            "This event's time follows your calendar provider and can't be moved in Compass.",
          );
          return false;
        }
        if (
          blockReconnectRequiredCalendar(
            payload.input.calendarId ?? original?.calendarId,
          )
        ) {
          return false;
        }
        const seriesMasterSchedule =
          source === "remote" && payload.input.scope === "all"
            ? snapshotSeriesMasterSchedule(queryClient, source, payload.id)
            : undefined;
        if (
          isMissingSeriesBase(
            source,
            payload.input.scope,
            payload.id,
            seriesMasterSchedule,
          )
        ) {
          showErrorToast(SERIES_BASE_MISSING_MESSAGE);
          return false;
        }
        const writeKey = seriesWriteKey(
          original,
          payload.input.scope,
          payload.id,
        );
        const opportunityId =
          original &&
          original.recurrence.kind === "occurrence" &&
          payload.input.scope === "this" &&
          payload.input.recurrence.kind === "preserve" &&
          !isRestoringHistory() &&
          !isRecurrenceScopeEditAskDeclined(original.id)
            ? recurrenceScopeOpportunityActions.begin({
                kind: "replace",
                original,
                input: payload.input,
                source,
              })
            : undefined;
        if (original) {
          recordEventEditHistory({
            id: payload.id,
            after: mergeReplaceInput(original, payload.input),
            scope: payload.input.scope,
            queryClient,
            source,
          });
        }
        // callbacks rides in variables so onMutate can run onOptimisticApplied
        // in the same task as the cache write (same pattern as create above).
        replaceMutation.mutate(
          {
            ...payload,
            writeKey,
            opportunityId,
            callbacks,
            seriesMasterSchedule,
          },
          callbacks,
        );
        return true;
      },
      delete: (payload: { id: EventId; scope: RecurrenceScope }) => {
        const original = findEventInCache(queryClient, payload.id, source);
        if (!isRestoringHistory() && isTargetReadOnly(original)) {
          console.warn(
            `[useEventMutations] blocked delete on read-only event ${payload.id}`,
          );
          return;
        }
        if (
          !isRestoringHistory() &&
          blockReconnectRequiredCalendar(original?.calendarId)
        ) {
          return;
        }
        const opportunityId =
          original &&
          original.recurrence.kind === "occurrence" &&
          payload.scope === "this" &&
          !isRestoringHistory()
            ? recurrenceScopeOpportunityActions.begin({
                kind: "delete",
                original,
                source,
              })
            : undefined;
        const existing = recordEventDeleteHistory({
          id: payload.id,
          scope: payload.scope,
          queryClient,
          source,
        });
        deleteMutation.mutate({
          ...payload,
          writeKey: payload.id,
          skipRepository: !existing,
          opportunityId,
        });
      },
      rsvp: ({ id, responseStatus, scope, accountEmail }: RsvpPayload) => {
        const original = findEventInCache(queryClient, id, source);
        // No isTargetReadOnly gate on purpose (finish line 5: RSVP works on
        // viewer-access calendars) — but a reconnect-required Google account
        // cannot deliver any command, so that block stays.
        if (blockReconnectRequiredCalendar(original?.calendarId)) {
          return;
        }
        // A series-wide answer serializes against the series id, same as a
        // scope-"all" replace.
        const writeKey =
          scope === "all" ? seriesWriteKey(original, "all", id) : id;
        rsvpMutation.mutate({
          id,
          input: { responseStatus, scope },
          accountEmail,
          writeKey,
        });
      },
      promoteRecurring: (
        opportunity: RecurrenceScopeOpportunity,
        scope: "thisAndFollowing" | "all",
      ) => {
        if (opportunity.source !== source) {
          dismissRecurrenceScopeToast(opportunity.id);
          recurrenceScopeOpportunityActions.complete(opportunity.id);
          return;
        }
        const seriesMasterSchedule =
          opportunity.kind === "replace" &&
          source === "remote" &&
          scope === "all"
            ? snapshotSeriesMasterSchedule(
                queryClient,
                source,
                opportunity.original.id as EventId,
              )
            : undefined;
        if (
          opportunity.kind === "replace" &&
          isMissingSeriesBase(
            source,
            scope,
            opportunity.original.id as EventId,
            seriesMasterSchedule,
          )
        ) {
          showErrorToast(SERIES_BASE_MISSING_MESSAGE);
          dismissRecurrenceScopeToast(opportunity.id);
          recurrenceScopeOpportunityActions.complete(opportunity.id);
          return;
        }
        // Broader recurring operations rewrite/split this series, so its
        // narrow client snapshots are no longer safe to replay. Keep history
        // for unrelated events the user changed while this toast was live.
        const seriesId = seriesIdOf(opportunity.original);
        if (seriesId) undoHistoryActions.discardSeries(seriesId);

        const onSuccess = () => {
          showRecurrenceScopeSuccessToast(opportunity, scope);
        };
        const onSettled = () => {
          recurrenceScopeOpportunityActions.complete(opportunity.id);
        };
        if (opportunity.kind === "replace") {
          const id = opportunity.original.id as EventId;
          replaceMutation.mutate(
            {
              id,
              input: { ...opportunity.input, scope },
              // Serialize behind the narrow write for this occurrence. The
              // optimistic projection still uses originalOverride so a
              // deleted/overridden cache entry cannot lose the promotion.
              writeKey: id,
              originalOverride: opportunity.original,
              seriesMasterSchedule,
            },
            { onSuccess, onSettled },
          );
          return;
        }

        deleteMutation.mutate(
          {
            id: opportunity.original.id as EventId,
            scope,
            writeKey: opportunity.original.id as EventId,
            skipRepository: false,
            originalOverride: opportunity.original,
          },
          { onSuccess, onSettled },
        );
      },
    }),
    [
      queryClient,
      source,
      isTargetReadOnly,
      blockReconnectRequiredCalendar,
      createMutation.mutate,
      deleteMutation.mutate,
      replaceMutation.mutate,
      rsvpMutation.mutate,
    ],
  );
}
