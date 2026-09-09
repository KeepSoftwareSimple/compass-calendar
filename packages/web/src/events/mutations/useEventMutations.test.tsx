import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { act, type PropsWithChildren } from "react";
import {
  DateOnlySchema,
  DateTimeSchema,
  type EventId,
  EventIdSchema,
} from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import {
  type CreateEventInput,
  type ReplaceEventInput,
} from "@core/types/event-command.contracts";
import { composeOccurrenceId } from "@core/util/occurrence-id";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

const track = mock();

// bun's mock.module is global and leaks into every other test file in the
// run. Spread the real module so unrelated suites still see its full
// surface, and only override track while this file runs - the flag flips
// back to the real implementation in afterAll.
const actualTrack = { ...(await import("@web/auth/posthog/track")) };
let isTrackMocked = true;

mock.module("@web/auth/posthog/track", () => ({
  ...actualTrack,
  track: (...args: Parameters<typeof actualTrack.track>) =>
    isTrackMocked ? track(...args) : actualTrack.track(...args),
}));

afterAll(() => {
  isTrackMocked = false;
});

import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { EVENT_DELETED_TOAST_ID } from "@web/common/constants/toast.constants";
import { RECURRENCE_SCOPE_TOAST_ID } from "@web/common/utils/toast/recurrence-scope.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import {
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import { type EventRepository } from "@web/events/repositories/event.repository.types";
import {
  runHistoryRestore,
  useUndoHistoryStore,
} from "@web/events/stores/undo.store";
import { useEventMutations } from "./useEventMutations";
import { useHasPendingEventMutations } from "./useEventPending";

const calendarKeyFor = (source: EventRepositorySource) =>
  eventQueryKeys.week({
    source,
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-07-08T00:00:00.000Z",
  });

const calendarKey = calendarKeyFor("local");

const dayKey = eventQueryKeys.day({
  source: "local",
  start: "2026-07-02T00:00:00.000Z",
  end: "2026-07-03T00:00:00.000Z",
});

const timedSchedule = (start: string, end: string) => ({
  kind: "timed" as const,
  start: start as never,
  end: end as never,
  timeZone: "UTC" as never,
});

const allDaySchedule = (start: string, end: string) => ({
  kind: "allDay" as const,
  start: DateOnlySchema.parse(start),
  end: DateOnlySchema.parse(end),
});

const event = (overrides: Partial<Event> = {}): Event =>
  createMockEvent({
    content: { kind: "details", title: "Original", description: "" },
    schedule: timedSchedule(
      "2026-07-02T16:00:00.000Z",
      "2026-07-02T17:00:00.000Z",
    ),
    ...overrides,
  });

const occurrence = (seriesId: EventId, overrides: Partial<Event> = {}): Event =>
  event({ recurrence: { kind: "occurrence", seriesId }, ...overrides });

const composedOccurrence = (
  seriesId: EventId,
  recurrenceId: string,
  overrides: Partial<Event> = {},
): Event =>
  occurrence(seriesId, {
    id: EventIdSchema.parse(
      composeOccurrenceId({ eventId: seriesId, recurrenceId }),
    ),
    ...overrides,
  });

const seriesMaster = (
  seriesId: EventId,
  overrides: Partial<Event> = {},
): Event =>
  event({
    id: seriesId,
    recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=5"] },
    ...overrides,
  });

const normalized = (...events: Event[]): NormalizedEventQueryData => ({
  ids: events.map(({ id }) => id),
  entities: Object.fromEntries(events.map((item) => [item.id, item])),
});

// Each repository call blocks on its own waiter (FIFO). `resolve`/`reject`
// settle every current and future call. `resolveNext`/`rejectNext` settle
// only the oldest in-flight call so tests can interleave outcomes of concurrent mutations.
const pendingControl = () => {
  type Waiter = { resolve: () => void; reject: (reason?: unknown) => void };
  const waiters: Waiter[] = [];
  let settledAll:
    | { mode: "resolve" }
    | { mode: "reject"; reason: unknown }
    | null = null;
  const wait = () =>
    new Promise<void>((resolve, reject) => {
      if (settledAll) {
        if (settledAll.mode === "resolve") resolve();
        else reject(settledAll.reason);
        return;
      }
      waiters.push({ resolve, reject });
    });
  return {
    wait,
    resolve: () => {
      settledAll = { mode: "resolve" };
      for (const waiter of waiters.splice(0)) waiter.resolve();
    },
    reject: (reason?: unknown) => {
      settledAll = { mode: "reject", reason };
      for (const waiter of waiters.splice(0)) waiter.reject(reason);
    },
    resolveNext: () => waiters.shift()?.resolve(),
    rejectNext: (reason?: unknown) => waiters.shift()?.reject(reason),
  };
};

const setup = (source: EventRepositorySource = "local") => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const pending = pendingControl();
  const calls: Array<{ method: string; value: unknown }> = [];
  const repository: EventRepository = {
    list: async () => [],
    create: async (input: CreateEventInput) => {
      calls.push({ method: "create", value: input });
      await pending.wait();
      return event({ id: (input.id ?? event().id) as EventId });
    },
    replace: async (id: EventId, input: ReplaceEventInput) => {
      calls.push({ method: "replace", value: { id, input } });
      await pending.wait();
      return event({ id });
    },
    delete: async (id: EventId, scope) => {
      calls.push({ method: "delete", value: { id, scope } });
      await pending.wait();
    },
  };
  const markedWrites: string[] = [];
  const errors: Error[] = [];
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => ({
      mutations: useEventMutations({
        source,
        repository,
        markWrite: async () => markedWrites.push("marked"),
        reportError: (error) => errors.push(error),
      }),
      hasPending: useHasPendingEventMutations(),
    }),
    { wrapper },
  );
  return { calls, errors, hook, markedWrites, pending, queryClient, source };
};

const replacePayload = (
  id: EventId,
  overrides: Partial<ReplaceEventInput> = {},
) => ({
  id,
  input: {
    content: {
      kind: "details" as const,
      title: "Original",
      description: "",
      location: "",
    },
    schedule: timedSchedule(
      "2026-07-02T16:00:00.000Z",
      "2026-07-02T17:00:00.000Z",
    ),
    recurrence: { kind: "preserve" as const },
    scope: "this" as const,
    ...overrides,
  },
});

type MutationTestContext = ReturnType<typeof setup>;

const replaceAndGetOpportunity = (
  context: MutationTestContext,
  id: EventId,
  overrides: Partial<ReplaceEventInput> = {},
) => {
  act(() =>
    context.hook.result.current.mutations.replace(
      replacePayload(id, overrides),
    ),
  );
  const opportunity = useRecurrenceScopeOpportunityStore.getState().opportunity;
  if (!opportunity || opportunity.kind !== "replace") {
    throw new Error("Expected a recurrence edit opportunity");
  }
  return opportunity;
};

const timedStartOf = (
  cached: NormalizedEventQueryData | undefined,
  id: EventId,
) => {
  const schedule = cached?.entities[id]?.schedule;
  return schedule?.kind === "timed" ? schedule.start : undefined;
};

const expectPromotedReplaceCall = async (
  context: MutationTestContext,
  id: EventId,
  expected: Partial<ReplaceEventInput>,
) => {
  await waitFor(() => expect(context.calls).toHaveLength(1));
  act(() => context.pending.resolveNext());
  await waitFor(() => {
    expect(context.calls).toContainEqual({
      method: "replace",
      value: {
        id,
        input: expect.objectContaining(expected),
      },
    });
  });
  context.pending.resolve();
};

describe("useEventMutations", () => {
  afterEach(() => {
    recurrenceScopeOpportunityActions.reset();
    track.mockClear();
  });

  test("promotes a deleted occurrence even after the narrow optimistic delete removes it from cache", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const context = setup();
    const seriesId = event().id;
    const first = occurrence(seriesId);
    const second = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    context.queryClient.setQueryData(calendarKey, normalized(first, second));

    act(() =>
      context.hook.result.current.mutations.delete({
        id: first.id,
        scope: "this",
      }),
    );
    const opportunity =
      useRecurrenceScopeOpportunityStore.getState().opportunity;
    expect(opportunity).toMatchObject({ kind: "delete", original: first });
    if (!opportunity) throw new Error("Expected a recurrence opportunity");

    act(() =>
      context.hook.result.current.mutations.promoteRecurring(
        opportunity,
        "all",
      ),
    );

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });
    await waitFor(() => {
      expect(context.calls).toContainEqual({
        method: "delete",
        value: { id: first.id, scope: "this" },
      });
    });

    act(() => context.pending.resolveNext());
    await waitFor(() => {
      expect(context.calls).toContainEqual({
        method: "delete",
        value: { id: first.id, scope: "all" },
      });
    });
    context.pending.resolve();
    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        EVENT_DELETED_TOAST_ID,
        expect.objectContaining({ render: expect.anything() }),
      );
    });
  });

  test("does not coalesce a promoted series edit behind a later narrow edit", async () => {
    const context = setup();
    const seriesId = event().id;
    const first = occurrence(seriesId);
    const second = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    context.queryClient.setQueryData(calendarKey, normalized(first, second));

    const opportunity = replaceAndGetOpportunity(context, first.id, {
      content: {
        kind: "details",
        title: "First narrow edit",
        description: "",
        location: "",
      },
    });

    act(() =>
      context.hook.result.current.mutations.promoteRecurring(
        opportunity,
        "all",
      ),
    );
    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(first.id, {
          content: {
            kind: "details",
            title: "Later narrow edit",
            description: "",
            location: "",
          },
        }),
      ),
    );

    await waitFor(() => expect(context.calls).toHaveLength(1));
    act(() => context.pending.resolveNext());
    await waitFor(() => {
      expect(context.calls).toContainEqual({
        method: "replace",
        value: expect.objectContaining({
          id: first.id,
          input: expect.objectContaining({
            scope: "all",
            // Local source must keep the occurrence-absolute schedule so
            // LocalEventRepository.replaceSeries can apply the delta once.
            schedule: timedSchedule(
              "2026-07-02T16:00:00.000Z",
              "2026-07-02T17:00:00.000Z",
            ),
          }),
        }),
      });
    });
    context.pending.resolve();
  });

  test("remote promote all rebases a middle timed occurrence onto the series master", async () => {
    const context = setup("remote");
    const seriesId = EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa");
    const master = seriesMaster(seriesId, {
      schedule: timedSchedule(
        "2026-07-01T16:00:00.000Z",
        "2026-07-01T17:00:00.000Z",
      ),
    });
    const middle = composedOccurrence(seriesId, "2026-07-03T16:00:00.000Z", {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    const moved = timedSchedule(
      "2026-07-04T16:00:00.000Z",
      "2026-07-04T17:00:00.000Z",
    );
    context.queryClient.setQueryData(
      calendarKeyFor("remote"),
      normalized(master, middle),
    );

    const opportunity = replaceAndGetOpportunity(context, middle.id, {
      content: {
        kind: "details",
        title: "Nudged",
        description: "",
        location: "",
      },
      schedule: moved,
    });

    act(() =>
      context.hook.result.current.mutations.promoteRecurring(
        opportunity,
        "all",
      ),
    );

    await expectPromotedReplaceCall(context, middle.id, {
      scope: "all",
      schedule: timedSchedule(
        "2026-07-02T16:00:00+00:00",
        "2026-07-02T17:00:00+00:00",
      ),
    });
  });

  test("remote promote all refuses to send an occurrence's dates when the series base is not cached", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const context = setup("remote");
    const seriesId = EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa");
    const birthday = composedOccurrence(seriesId, "2026-09-14T00:00:00.000Z", {
      schedule: allDaySchedule("2026-09-14", "2026-09-15"),
    });
    // Only the occurrence is cached: the series base (first occurrence in
    // 2024) never made it into the window's entry.
    context.queryClient.setQueryData(
      calendarKeyFor("remote"),
      normalized(birthday),
    );

    const opportunity = replaceAndGetOpportunity(context, birthday.id, {
      content: {
        kind: "details",
        title: "My Birthday",
        description: "",
        location: "",
      },
      schedule: allDaySchedule("2026-09-14", "2026-09-15"),
    });

    act(() =>
      context.hook.result.current.mutations.promoteRecurring(
        opportunity,
        "all",
      ),
    );

    // Refused before anything is queued: the ask closes with an error toast,
    // and no mutation ran, so the narrow scope-"this" write is not coalesced
    // away and still reaches the repository on its own.
    expect(mocks.error).toHaveBeenCalledWith(
      expect.stringMatching(/still loading/),
      expect.anything(),
    );
    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toBeNull();
    await waitFor(() => expect(context.calls).toHaveLength(1));
    act(() => context.pending.resolve());
    await waitFor(() =>
      expect(context.hook.result.current.hasPending).toBe(false),
    );
    expect(context.errors).toEqual([]);
    expect(context.calls).toEqual([
      {
        method: "replace",
        value: {
          id: birthday.id,
          input: expect.objectContaining({
            scope: "this",
            schedule: allDaySchedule("2026-09-14", "2026-09-15"),
          }),
        },
      },
    ]);
  });

  test("remote promote all rebases a middle all-day occurrence onto the series master", async () => {
    const context = setup("remote");
    const seriesId = EventIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbb");
    const master = seriesMaster(seriesId, {
      schedule: allDaySchedule("2026-07-01", "2026-07-02"),
    });
    const middle = composedOccurrence(seriesId, "2026-07-03T00:00:00.000Z", {
      schedule: allDaySchedule("2026-07-03", "2026-07-04"),
    });
    const moved = allDaySchedule("2026-07-04", "2026-07-05");
    context.queryClient.setQueryData(
      calendarKeyFor("remote"),
      normalized(master, middle),
    );

    const opportunity = replaceAndGetOpportunity(context, middle.id, {
      content: {
        kind: "details",
        title: "All-day nudged",
        description: "",
        location: "",
      },
      schedule: moved,
    });

    act(() =>
      context.hook.result.current.mutations.promoteRecurring(
        opportunity,
        "all",
      ),
    );

    await expectPromotedReplaceCall(context, middle.id, {
      scope: "all",
      schedule: allDaySchedule("2026-07-02", "2026-07-03"),
    });
  });

  test("remote promote thisAndFollowing keeps the occurrence absolute schedule", async () => {
    const context = setup("remote");
    const seriesId = EventIdSchema.parse("cccccccccccccccccccccccc");
    const master = seriesMaster(seriesId, {
      schedule: timedSchedule(
        "2026-07-01T16:00:00.000Z",
        "2026-07-01T17:00:00.000Z",
      ),
    });
    const middle = composedOccurrence(seriesId, "2026-07-03T16:00:00.000Z", {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    const moved = timedSchedule(
      "2026-07-04T16:00:00.000Z",
      "2026-07-04T17:00:00.000Z",
    );
    context.queryClient.setQueryData(
      calendarKeyFor("remote"),
      normalized(master, middle),
    );

    const opportunity = replaceAndGetOpportunity(context, middle.id, {
      content: {
        kind: "details",
        title: "Split nudge",
        description: "",
        location: "",
      },
      schedule: moved,
    });

    act(() =>
      context.hook.result.current.mutations.promoteRecurring(
        opportunity,
        "thisAndFollowing",
      ),
    );

    await expectPromotedReplaceCall(context, middle.id, {
      scope: "thisAndFollowing",
      schedule: moved,
    });
  });

  test("promoted all-events schedule move keeps the edited occurrence at the new time", async () => {
    const context = setup();
    const seriesId = event().id;
    const previous = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-01T16:00:00.000Z",
        "2026-07-01T17:00:00.000Z",
      ),
    });
    const current = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-02T16:00:00.000Z",
        "2026-07-02T17:00:00.000Z",
      ),
    });
    const next = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    // Four days later: still in the Jul 1–8 week. A second shift would land
    // on Jul 10 and applyEventProjectionAcrossQueries would drop the card.
    const moved = timedSchedule(
      "2026-07-06T16:00:00.000Z",
      "2026-07-06T17:00:00.000Z",
    );
    context.queryClient.setQueryData(
      calendarKey,
      normalized(previous, current, next),
    );

    const opportunity = replaceAndGetOpportunity(context, current.id, {
      schedule: moved,
    });

    act(() =>
      context.hook.result.current.mutations.promoteRecurring(
        opportunity,
        "all",
      ),
    );

    await waitFor(() => {
      const cached =
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey);
      expect(cached?.ids).toContain(current.id);
      expect(timedStartOf(cached, current.id)).toBe(
        DateTimeSchema.parse("2026-07-06T16:00:00.000Z"),
      );
      expect(timedStartOf(cached, previous.id)).toBe(
        DateTimeSchema.parse("2026-07-05T16:00:00+00:00"),
      );
      expect(timedStartOf(cached, next.id)).toBe(
        DateTimeSchema.parse("2026-07-07T16:00:00+00:00"),
      );
    });

    context.pending.resolve();
  });

  test("promoted this-and-following schedule move keeps the edited occurrence at the new time", async () => {
    const context = setup();
    const seriesId = event().id;
    const previous = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-01T16:00:00.000Z",
        "2026-07-01T17:00:00.000Z",
      ),
    });
    const current = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-02T16:00:00.000Z",
        "2026-07-02T17:00:00.000Z",
      ),
    });
    const next = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    const moved = timedSchedule(
      "2026-07-06T16:00:00.000Z",
      "2026-07-06T17:00:00.000Z",
    );
    context.queryClient.setQueryData(
      calendarKey,
      normalized(previous, current, next),
    );

    const opportunity = replaceAndGetOpportunity(context, current.id, {
      schedule: moved,
    });

    act(() =>
      context.hook.result.current.mutations.promoteRecurring(
        opportunity,
        "thisAndFollowing",
      ),
    );

    await waitFor(() => {
      const cached =
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey);
      expect(cached?.ids).toContain(current.id);
      expect(timedStartOf(cached, current.id)).toBe(
        DateTimeSchema.parse("2026-07-06T16:00:00.000Z"),
      );
      expect(timedStartOf(cached, previous.id)).toBe(
        DateTimeSchema.parse("2026-07-01T16:00:00.000Z"),
      );
      expect(timedStartOf(cached, next.id)).toBe(
        DateTimeSchema.parse("2026-07-07T16:00:00+00:00"),
      );
    });

    context.pending.resolve();
  });

  test("remote scope-all rules edit rebases from the pre-optimistic master snapshot", async () => {
    const context = setup("remote");
    const seriesId = EventIdSchema.parse("dddddddddddddddddddddddd");
    const master = seriesMaster(seriesId, {
      schedule: timedSchedule(
        "2026-07-01T16:00:00.000Z",
        "2026-07-01T17:00:00.000Z",
      ),
      recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=5"] },
    });
    const middle = composedOccurrence(seriesId, "2026-07-03T16:00:00.000Z", {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    const moved = timedSchedule(
      "2026-07-04T16:00:00.000Z",
      "2026-07-04T17:00:00.000Z",
    );
    context.queryClient.setQueryData(
      calendarKeyFor("remote"),
      normalized(master, middle),
    );

    // Direct scope-all with new rules: optimistic projection rewrites the
    // cached master with the occurrence absolute schedule before mutationFn.
    // Rebase must still use the snapshotted pre-optimistic master.
    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(middle.id, {
          content: {
            kind: "details",
            title: "Rules + nudge",
            description: "",
            location: "",
          },
          schedule: moved,
          recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=3"] },
          scope: "all",
        }),
      ),
    );

    await waitFor(() => expect(context.calls).toHaveLength(1));
    expect(context.calls[0]).toEqual({
      method: "replace",
      value: {
        id: middle.id,
        input: expect.objectContaining({
          scope: "all",
          schedule: timedSchedule(
            "2026-07-02T16:00:00+00:00",
            "2026-07-02T17:00:00+00:00",
          ),
        }),
      },
    });
    context.pending.resolve();
  });

  test("optimistically patches recurring instances across day and week caches", async () => {
    const context = setup();
    const seriesId = event().id;
    const first = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-02T16:00:00.000Z",
        "2026-07-02T17:00:00.000Z",
      ),
    });
    const second = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    context.queryClient.setQueryData(calendarKey, normalized(first, second));
    context.queryClient.setQueryData(dayKey, normalized(first));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(first.id, {
          content: {
            kind: "details",
            title: "Updated series",
            description: "",
            location: "",
          },
          schedule: first.schedule as ReplaceEventInput["schedule"],
          scope: "all",
        }),
      ),
    );

    await waitFor(() => {
      const week =
        context.queryClient.getQueryData<NormalizedEventQueryData>(
          calendarKey,
        )!;
      const day =
        context.queryClient.getQueryData<NormalizedEventQueryData>(dayKey)!;
      expect(week.entities[first.id].content).toMatchObject({
        title: "Updated series",
      });
      expect(week.entities[second.id].content).toMatchObject({
        title: "Updated series",
      });
      expect(day.entities[first.id].content).toMatchObject({
        title: "Updated series",
      });
    });

    context.pending.resolve();
  });

  test("optimistically converts a series from timed to all-day for all-events edits", async () => {
    const context = setup();
    const seriesId = event().id;
    const first = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-02T16:00:00.000Z",
        "2026-07-02T17:00:00.000Z",
      ),
    });
    const second = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    context.queryClient.setQueryData(calendarKey, normalized(first, second));
    context.queryClient.setQueryData(dayKey, normalized(first));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(first.id, {
          schedule: {
            kind: "allDay",
            start: DateOnlySchema.parse("2026-07-02"),
            end: DateOnlySchema.parse("2026-07-03"),
          },
          scope: "all",
        }),
      ),
    );

    await waitFor(() => {
      const week =
        context.queryClient.getQueryData<NormalizedEventQueryData>(
          calendarKey,
        )!;
      expect(week.entities[first.id].schedule).toEqual({
        kind: "allDay",
        start: DateOnlySchema.parse("2026-07-02"),
        end: DateOnlySchema.parse("2026-07-03"),
      });
      expect(week.entities[second.id].schedule).toEqual({
        kind: "allDay",
        start: DateOnlySchema.parse("2026-07-03"),
        end: DateOnlySchema.parse("2026-07-04"),
      });
    });

    context.pending.resolve();
  });

  test("optimistically moves only this-and-following instances", async () => {
    const context = setup();
    const seriesId = event().id;
    const instances = [1, 2, 3].map((day) =>
      occurrence(seriesId, {
        schedule: timedSchedule(
          `2026-07-0${day}T16:00:00.000Z`,
          `2026-07-0${day}T17:00:00.000Z`,
        ),
      }),
    );
    context.queryClient.setQueryData(calendarKey, normalized(...instances));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(instances[1].id, {
          schedule: timedSchedule(
            "2026-07-02T18:00:00.000Z",
            "2026-07-02T19:00:00.000Z",
          ),
          scope: "thisAndFollowing",
        }),
      ),
    );

    await waitFor(() => {
      const cached =
        context.queryClient.getQueryData<NormalizedEventQueryData>(
          calendarKey,
        )!;
      const scheduleOf = (id: EventId) => {
        const schedule = cached.entities[id].schedule;
        return schedule.kind === "timed" ? schedule.start : null;
      };
      expect(scheduleOf(instances[0].id)).toBe(
        DateTimeSchema.parse("2026-07-01T16:00:00.000Z"),
      );
      expect(scheduleOf(instances[1].id)).toBe(
        DateTimeSchema.parse("2026-07-02T18:00:00.000Z"),
      );
      expect(scheduleOf(instances[2].id)).toBe(
        DateTimeSchema.parse("2026-07-03T18:00:00+00:00"),
      );
    });

    context.pending.resolve();
  });

  test("materializes optimistic instances when a single event becomes a series", async () => {
    const context = setup();
    const single = event();
    context.queryClient.setQueryData(calendarKey, normalized(single));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(single.id, {
          recurrence: {
            kind: "series",
            rules: ["RRULE:FREQ=DAILY;COUNT=7"] as never,
          },
        }),
      ),
    );

    await waitFor(() => {
      const cached =
        context.queryClient.getQueryData<NormalizedEventQueryData>(
          calendarKey,
        )!;
      expect(cached.entities[single.id]?.recurrence.kind).toBe("series");
      const instances = Object.values(cached.entities).filter(
        (item) =>
          item.recurrence.kind === "occurrence" &&
          item.recurrence.seriesId === single.id,
      );
      // Daily from Jul 2 bounded by the cached week's end (Jul 8): 6 instances.
      expect(instances).toHaveLength(6);
      const starts = instances
        .map((item) => new Date(item.schedule.start).toISOString())
        .sort();
      expect(starts[0]).toBe("2026-07-02T16:00:00.000Z");
      expect(starts[1]).toBe("2026-07-03T16:00:00.000Z");
    });

    context.pending.resolve();
  });

  test("materializes optimistic instances for a recurring create", async () => {
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());

    act(() =>
      context.hook.result.current.mutations.create({
        calendarId: event().calendarId,
        content: {
          kind: "details",
          title: "New series",
          description: "",
          location: "",
        },
        schedule: timedSchedule(
          "2026-07-02T16:00:00.000Z",
          "2026-07-02T17:00:00.000Z",
        ),
        recurrence: {
          kind: "series",
          rules: ["RRULE:FREQ=DAILY;COUNT=7"] as never,
        },
      }),
    );

    await waitFor(() => {
      const cached =
        context.queryClient.getQueryData<NormalizedEventQueryData>(
          calendarKey,
        )!;
      const instances = Object.values(cached.entities).filter(
        (item) => item.recurrence.kind === "occurrence",
      );
      expect(instances).toHaveLength(6);
    });

    context.pending.resolve();
  });

  test("replaces stale cached instances when the series rules change", async () => {
    const context = setup();
    const base = event({
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=DAILY;COUNT=7"] as never,
      },
    });
    const first = occurrence(base.id, {
      schedule: timedSchedule(
        "2026-07-02T16:00:00.000Z",
        "2026-07-02T17:00:00.000Z",
      ),
    });
    const second = occurrence(base.id, {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    context.queryClient.setQueryData(
      calendarKey,
      normalized(base, first, second),
    );

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(first.id, {
          recurrence: {
            kind: "series",
            rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] as never,
          },
          scope: "all",
        }),
      ),
    );

    await waitFor(() => {
      const cached =
        context.queryClient.getQueryData<NormalizedEventQueryData>(
          calendarKey,
        )!;
      // Old daily instances are gone; the weekly rule only yields Jul 2
      // within the cached week.
      expect(cached.entities[first.id]).toBeUndefined();
      expect(cached.entities[second.id]).toBeUndefined();
      const instances = Object.values(cached.entities).filter(
        (item) =>
          item.recurrence.kind === "occurrence" &&
          item.recurrence.seriesId === base.id,
      );
      expect(instances).toHaveLength(1);
      expect(cached.entities[base.id]?.recurrence).toMatchObject({
        kind: "series",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=3"],
      });
    });

    context.pending.resolve();
  });

  test("purges this-and-following instances from every cached week on delete", async () => {
    const context = setup();
    const nextWeekKey = eventQueryKeys.week({
      source: "local",
      start: "2026-07-08T00:00:00.000Z",
      end: "2026-07-15T00:00:00.000Z",
    });
    const seriesId = event().id;
    const days = [2, 3, 9, 10].map((day) =>
      occurrence(seriesId, {
        schedule: timedSchedule(
          `2026-07-${String(day).padStart(2, "0")}T16:00:00.000Z`,
          `2026-07-${String(day).padStart(2, "0")}T17:00:00.000Z`,
        ),
      }),
    );
    context.queryClient.setQueryData(calendarKey, normalized(days[0], days[1]));
    context.queryClient.setQueryData(nextWeekKey, normalized(days[2], days[3]));

    act(() =>
      context.hook.result.current.mutations.delete({
        id: days[1].id,
        scope: "thisAndFollowing",
      }),
    );

    await waitFor(() => {
      const week =
        context.queryClient.getQueryData<NormalizedEventQueryData>(
          calendarKey,
        )!;
      const nextWeek =
        context.queryClient.getQueryData<NormalizedEventQueryData>(
          nextWeekKey,
        )!;
      expect(week.entities[days[0].id]).toBeDefined();
      expect(week.entities[days[1].id]).toBeUndefined();
      expect(nextWeek.entities[days[2].id]).toBeUndefined();
      expect(nextWeek.entities[days[3].id]).toBeUndefined();
    });

    context.pending.resolve();
  });

  test("settle invalidates with refetchType active so only observed ranges refetch", async () => {
    const context = setup();
    const single = event();
    context.queryClient.setQueryData(calendarKey, normalized(single));
    const invalidations: unknown[] = [];
    const original = context.queryClient.invalidateQueries.bind(
      context.queryClient,
    );
    context.queryClient.invalidateQueries = ((filters?: unknown) => {
      invalidations.push(filters);
      return original(filters as never);
    }) as typeof context.queryClient.invalidateQueries;

    act(() =>
      context.hook.result.current.mutations.replace(replacePayload(single.id)),
    );
    context.pending.resolve();

    await waitFor(() => {
      expect(invalidations).toContainEqual({
        queryKey: eventQueryKeys.all,
        refetchType: "active",
      });
    });
  });

  test("serializes series edits submitted through different instances", async () => {
    const context = setup();
    const seriesId = event().id;
    const first = occurrence(seriesId);
    const second = occurrence(seriesId, {
      schedule: timedSchedule(
        "2026-07-03T16:00:00.000Z",
        "2026-07-03T17:00:00.000Z",
      ),
    });
    context.queryClient.setQueryData(calendarKey, normalized(first, second));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(first.id, {
          content: {
            kind: "details",
            title: "First edit",
            description: "",
            location: "",
          },
          scope: "all",
        }),
      ),
    );
    await waitFor(() =>
      expect(
        context.calls.filter(({ method }) => method === "replace"),
      ).toHaveLength(1),
    );

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(second.id, {
          content: {
            kind: "details",
            title: "Second edit",
            description: "",
            location: "",
          },
          scope: "all",
        }),
      ),
    );
    expect(
      context.calls.filter(({ method }) => method === "replace"),
    ).toHaveLength(1);

    act(() => context.pending.resolveNext());
    await waitFor(() =>
      expect(
        context.calls.filter(({ method }) => method === "replace"),
      ).toHaveLength(2),
    );
    context.pending.resolve();
  });

  test("creates optimistically, exposes pending state, and invalidates on success", async () => {
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());
    const created = event({
      content: { kind: "details", title: "Created", description: "" },
    });

    act(() =>
      context.hook.result.current.mutations.create({
        id: created.id,
        calendarId: created.calendarId,
        content: created.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: created.schedule as never,
        recurrence: { kind: "single" },
      }),
    );

    await waitFor(() => {
      expect(context.hook.result.current.hasPending).toBe(true);
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[created.id],
      ).toBeDefined();
    });
    expect(
      context.queryClient.getMutationCache().getAll()[0].options.mutationKey,
    ).toEqual(["events", "mutation", "create"]);

    context.pending.resolve();

    await waitFor(() => {
      expect(context.hook.result.current.hasPending).toBe(false);
      expect(context.markedWrites).toEqual(["marked"]);
      expect(
        context.queryClient.getQueryState(calendarKey)?.isInvalidated,
      ).toBe(true);
    });
  });

  test("reports the error, rolls back the optimistic write, and invalidates when a replace fails", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, {
          content: {
            kind: "details",
            title: "Changed",
            description: "",
            location: "",
          },
        }),
      ),
    );

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].content,
      ).toMatchObject({ title: "Changed" });
    });
    context.pending.reject(new Error("write failed"));

    await waitFor(() => {
      expect(context.errors[0]?.message).toBe("write failed");
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].content,
      ).toMatchObject({ title: "Original" });
      expect(
        context.queryClient.getQueryState(calendarKey)?.isInvalidated,
      ).toBe(true);
    });
  });

  test("withdraws the scope offer when a default occurrence change fails", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const context = setup();
    const item = occurrence(event().id);
    context.queryClient.setQueryData(calendarKey, normalized(item));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(item.id, {
          content: {
            kind: "details",
            title: "Changed",
            description: "",
            location: "",
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(
        context.calls.filter(({ method }) => method === "replace"),
      ).toHaveLength(1),
    );

    context.pending.reject(new Error("write failed"));

    await waitFor(() => {
      expect(context.errors[0]?.message).toBe("write failed");
      expect(mocks.dismiss).toHaveBeenCalledWith(RECURRENCE_SCOPE_TOAST_ID);
    });
  });

  test("keeps a newer edit's optimistic value when an older edit for the same event fails", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));
    const editEvent = (title: string) =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, {
          content: { kind: "details", title, description: "", location: "" },
        }),
      );

    act(() => editEvent("First"));
    await waitFor(() => {
      expect(
        context.calls.filter(({ method }) => method === "replace"),
      ).toHaveLength(1);
    });
    act(() => editEvent("Second"));
    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].content,
      ).toMatchObject({ title: "Second" });
    });

    act(() => context.pending.rejectNext(new Error("first edit failed")));

    await waitFor(() => {
      expect(context.errors[0]?.message).toBe("first edit failed");
    });
    // The newer edit's optimistic value survives the older edit's failure,
    // and no refetch fires while the newer mutation is still in flight.
    expect(
      context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
        ?.entities[original.id].content,
    ).toMatchObject({ title: "Second" });
    expect(context.queryClient.getQueryState(calendarKey)?.isInvalidated).toBe(
      false,
    );

    act(() => context.pending.resolveNext());
    await waitFor(() => {
      expect(context.hook.result.current.hasPending).toBe(false);
      expect(
        context.queryClient.getQueryState(calendarKey)?.isInvalidated,
      ).toBe(true);
    });
  });

  test("serializes rapid edits to the same event so writes never overlap", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));
    const editEvent = (title: string) =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, {
          content: { kind: "details", title, description: "", location: "" },
        }),
      );

    act(() => editEvent("First"));
    await waitFor(() => {
      expect(
        context.calls.filter(({ method }) => method === "replace"),
      ).toHaveLength(1);
    });
    act(() => editEvent("Second"));

    // The optimistic update lands immediately, but the second repository
    // write must wait for the first to settle: overlapping PUTs on one
    // document surface as backend write-conflict 500s.
    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].content,
      ).toMatchObject({ title: "Second" });
    });
    expect(
      context.calls.filter(({ method }) => method === "replace"),
    ).toHaveLength(1);

    act(() => context.pending.resolveNext());

    await waitFor(() => {
      expect(
        context.calls.filter(({ method }) => method === "replace"),
      ).toHaveLength(2);
    });
    const lastEdit = context.calls.filter(
      ({ method }) => method === "replace",
    )[1];
    expect(
      (lastEdit.value as { input: ReplaceEventInput }).input.content,
    ).toMatchObject({ title: "Second" });
    context.pending.resolve();
  });

  test("coalesces a burst of edits to one event into a single write of the final state", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));
    const editEvent = (title: string) =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, {
          content: { kind: "details", title, description: "", location: "" },
        }),
      );

    // A held-key nudge (or drag) fires many edits before any write lands. Each
    // earlier edit sees a newer edit already queued and skips its network write,
    // so only the final position is actually persisted — no per-keystroke PUT,
    // no trailing "replay" as the serialized queue drains after the user stops.
    act(() => {
      editEvent("First");
      editEvent("Second");
      editEvent("Third");
    });

    // Optimistic UI still reflects every step, ending on the final title.
    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].content,
      ).toMatchObject({ title: "Third" });
    });

    // Exactly one repository write, carrying the final state.
    await waitFor(() => {
      expect(
        context.calls.filter(({ method }) => method === "replace"),
      ).toHaveLength(1);
    });
    const edits = context.calls.filter(({ method }) => method === "replace");
    expect(
      (edits[0].value as { input: ReplaceEventInput }).input.content,
    ).toMatchObject({ title: "Third" });

    context.pending.resolve();

    // Every edit still marks a write (anon-change tracking) even though two
    // skipped the network.
    await waitFor(() => {
      expect(context.markedWrites).toHaveLength(3);
      expect(context.hook.result.current.hasPending).toBe(false);
    });
    expect(
      context.calls.filter(({ method }) => method === "replace"),
    ).toHaveLength(1);
  });

  test("a failed edit leaves a concurrent edit to another event untouched", async () => {
    const context = setup();
    const doomed = event();
    const other = event({
      content: { kind: "details", title: "Other", description: "" },
    });
    context.queryClient.setQueryData(calendarKey, normalized(doomed, other));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(doomed.id, {
          content: {
            kind: "details",
            title: "Doomed",
            description: "",
            location: "",
          },
        }),
      ),
    );
    await waitFor(() => {
      expect(
        context.calls.filter(({ method }) => method === "replace"),
      ).toHaveLength(1);
    });
    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(other.id, {
          content: {
            kind: "details",
            title: "Survivor",
            description: "",
            location: "",
          },
        }),
      ),
    );
    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[other.id].content,
      ).toMatchObject({ title: "Survivor" });
    });

    act(() => context.pending.rejectNext(new Error("doomed edit failed")));

    await waitFor(() => {
      expect(context.errors[0]?.message).toBe("doomed edit failed");
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[doomed.id].content,
      ).toMatchObject({ title: "Original" });
    });
    expect(
      context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
        ?.entities[other.id].content,
    ).toMatchObject({ title: "Survivor" });

    act(() => context.pending.resolveNext());
    await waitFor(() => {
      expect(context.hook.result.current.hasPending).toBe(false);
    });
  });

  test("removes calendar events optimistically", async () => {
    const context = setup();
    const calendarEvent = event();
    context.queryClient.setQueryData(calendarKey, normalized(calendarEvent));

    act(() =>
      context.hook.result.current.mutations.delete({
        id: calendarEvent.id,
        scope: "this",
      }),
    );

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });
    context.pending.resolve();
  });

  test("defers deletion until the in-flight create persists, then deletes server-side", async () => {
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());
    const created = event({
      content: { kind: "details", title: "Created", description: "" },
    });

    act(() =>
      context.hook.result.current.mutations.create({
        id: created.id,
        calendarId: created.calendarId,
        content: created.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: created.schedule as never,
        recurrence: { kind: "single" },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.hasPending).toBe(true);
    });

    act(() =>
      context.hook.result.current.mutations.delete({
        id: created.id,
        scope: "this",
      }),
    );

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });
    // The create has not persisted yet, so the backend delete must wait —
    // deleting now would 404, and skipping it would resurrect the event once
    // the create lands.
    expect(context.calls.some(({ method }) => method === "delete")).toBe(false);

    context.pending.resolve();

    await waitFor(() => {
      expect(context.calls.some(({ method }) => method === "delete")).toBe(
        true,
      );
    });
  });

  test("skips the deferred deletion when the create fails", async () => {
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());
    const created = event();

    act(() =>
      context.hook.result.current.mutations.create({
        id: created.id,
        calendarId: created.calendarId,
        content: created.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: created.schedule as never,
        recurrence: { kind: "single" },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.hasPending).toBe(true);
    });
    act(() =>
      context.hook.result.current.mutations.delete({
        id: created.id,
        scope: "this",
      }),
    );

    context.pending.reject(new Error("create failed"));

    await waitFor(() => {
      expect(context.errors[0]?.message).toBe("create failed");
      expect(context.hook.result.current.hasPending).toBe(false);
    });
    // The event never existed server-side, so there is nothing to delete.
    expect(context.calls.some(({ method }) => method === "delete")).toBe(false);
  });

  test("defers a replace until the in-flight create persists", async () => {
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());
    const created = event();

    act(() =>
      context.hook.result.current.mutations.create({
        id: created.id,
        calendarId: created.calendarId,
        content: created.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: created.schedule as never,
        recurrence: { kind: "single" },
      }),
    );
    await waitFor(() => {
      expect(context.calls.some(({ method }) => method === "create")).toBe(
        true,
      );
    });

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(created.id, {
          content: {
            kind: "details",
            title: "Edited",
            description: "",
            location: "",
          },
        }),
      ),
    );

    // The replace's repository write must wait for the create to persist; an
    // early write would target an id the backend does not know yet.
    expect(context.calls.some(({ method }) => method === "replace")).toBe(
      false,
    );

    context.pending.resolve();

    await waitFor(() => {
      expect(context.calls.some(({ method }) => method === "replace")).toBe(
        true,
      );
    });
  });

  test("does not persist deletion for an event absent from cache", async () => {
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());
    const ghostId = event().id;

    act(() =>
      context.hook.result.current.mutations.delete({
        id: ghostId,
        scope: "this",
      }),
    );

    await waitFor(() => {
      expect(context.markedWrites).toEqual(["marked"]);
    });
    expect(context.calls.some(({ method }) => method === "delete")).toBe(false);
    expect(context.errors).toEqual([]);
  });

  test("inserts an edited event into a newly-matching cached range", async () => {
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());
    // The event is already known to the cache from an unrelated read (e.g.
    // an earlier day view), just not a member of the week range yet — the
    // ReplaceEventInput itself carries no calendarId (replace can't move
    // calendars), so the optimistic merge needs a cached original to build
    // a full `Event` from.
    const movedIn = event();
    context.queryClient.setQueryData(dayKey, normalized(movedIn));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(movedIn.id, {
          content: {
            kind: "details",
            title: "Moved In",
            description: "",
            location: "",
          },
          schedule: timedSchedule(
            "2026-07-04T16:00:00.000Z",
            "2026-07-04T17:00:00.000Z",
          ),
        }),
      ),
    );

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[movedIn.id]?.content,
      ).toMatchObject({ title: "Moved In" });
    });
    context.pending.resolve();
  });

  test("removes an edited event from a range it no longer belongs to", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, {
          // Push the event well outside the cached 2026-07-01..08 week.
          schedule: timedSchedule(
            "2026-09-01T16:00:00.000Z",
            "2026-09-01T17:00:00.000Z",
          ),
        }),
      ),
    );

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });
    context.pending.resolve();
  });

  test("runs replace onOptimisticApplied after the optimistic cache write", async () => {
    const context = setup();
    const original = event({
      content: {
        kind: "details",
        title: "Original",
        description: "",
        color: "blue",
      },
    });
    context.queryClient.setQueryData(calendarKey, normalized(original));

    let colorAtCallback: unknown;
    const onOptimisticApplied = mock(() => {
      colorAtCallback = (
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].content as { color?: string }
      ).color;
    });

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, {
          content: {
            kind: "details",
            title: "Original",
            description: "",
            location: "",
            color: "coral",
          },
        }),
        { onOptimisticApplied },
      ),
    );

    await waitFor(() => {
      expect(onOptimisticApplied).toHaveBeenCalledTimes(1);
    });
    expect(colorAtCallback).toBe("coral");

    context.pending.resolve();
  });

  test("clears colorHex on optimistic replace when a slot color is written", async () => {
    const context = setup();
    const original = event({
      content: {
        kind: "details",
        title: "Original",
        description: "",
        color: "blue",
        colorHex: "#009688",
      },
    });
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, {
          content: {
            kind: "details",
            title: "Original",
            description: "",
            location: "",
            color: "coral",
          },
        }),
      ),
    );

    await waitFor(() => {
      const content =
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].content;
      expect(content).toMatchObject({ kind: "details", color: "coral" });
      expect(content).not.toHaveProperty("colorHex");
    });

    context.pending.resolve();
  });
});

describe("undo history recording", () => {
  test("records an edit with before/after snapshots", () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, {
          content: {
            kind: "details",
            title: "Moved",
            description: "",
            location: "",
          },
        }),
      ),
    );

    const { past } = useUndoHistoryStore.getState();
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({
      kind: "edit",
      id: original.id,
      before: { content: { title: "Original" } },
      after: { content: { title: "Moved" } },
    });
    context.pending.resolve();
  });

  test("skips series-scope edits and edits missing from cache", () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(original.id, { scope: "all" }),
      ),
    );
    act(() =>
      context.hook.result.current.mutations.replace(replacePayload(event().id)),
    );

    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    context.pending.resolve();
  });

  test("records a recurring occurrence edit at this-event scope (undoable via un-cancel replay)", () => {
    const context = setup();
    const seriesId = event().id;
    const instance = occurrence(seriesId);
    context.queryClient.setQueryData(
      calendarKey,
      normalized(instance, event()),
    );

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(instance.id, {
          content: {
            kind: "details",
            title: "Moved",
            description: "",
            location: "",
          },
        }),
      ),
    );
    const { past } = useUndoHistoryStore.getState();
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({
      kind: "edit",
      id: instance.id,
      after: { content: { title: "Moved" } },
    });
    context.pending.resolve();
  });

  test("still skips a series-master edit (scope all/thisAndFollowing never reaches this-scope recording)", () => {
    const context = setup();
    const seriesBase = event({
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    context.queryClient.setQueryData(calendarKey, normalized(seriesBase));

    act(() =>
      context.hook.result.current.mutations.replace(
        replacePayload(seriesBase.id, {
          content: {
            kind: "details",
            title: "Moved",
            description: "",
            location: "",
          },
          scope: "all",
        }),
      ),
    );
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    context.pending.resolve();
  });

  test("records create snapshots for both a single event and a new series", () => {
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());
    const created = event({
      content: { kind: "details", title: "Created", description: "" },
    });

    act(() =>
      context.hook.result.current.mutations.create({
        id: created.id,
        calendarId: created.calendarId,
        content: created.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: created.schedule as never,
        recurrence: { kind: "single" },
      }),
    );

    const { past } = useUndoHistoryStore.getState();
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({
      kind: "create",
      event: { id: created.id, content: { title: "Created" } },
    });

    // A brand-new series create is now also recordable — its undo is a
    // scope-"all" delete of the whole series (see useUndoRedo.undoCreate).
    const seriesCreated = event({
      content: { kind: "details", title: "New series", description: "" },
    });
    act(() =>
      context.hook.result.current.mutations.create({
        id: seriesCreated.id,
        calendarId: seriesCreated.calendarId,
        content: seriesCreated.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: seriesCreated.schedule as never,
        recurrence: {
          kind: "series",
          rules: ["RRULE:FREQ=WEEKLY"],
        },
      }),
    );
    const after = useUndoHistoryStore.getState().past;
    expect(after).toHaveLength(2);
    expect(after[1]).toMatchObject({
      kind: "create",
      event: {
        id: seriesCreated.id,
        recurrence: { kind: "series" },
      },
    });
    context.pending.resolve();
  });

  test("records delete snapshots for both standalone and recurring-occurrence deletes", () => {
    const context = setup();
    const seriesId = event().id;
    const recurring = occurrence(seriesId);
    const standalone = event();
    context.queryClient.setQueryData(
      calendarKey,
      normalized(standalone, recurring),
    );

    act(() =>
      context.hook.result.current.mutations.delete({
        id: recurring.id,
        scope: "this",
      }),
    );
    expect(useUndoHistoryStore.getState().past).toEqual([
      { kind: "delete", event: recurring },
    ]);

    act(() =>
      context.hook.result.current.mutations.delete({
        id: standalone.id,
        scope: "this",
      }),
    );
    expect(useUndoHistoryStore.getState().past).toEqual([
      { kind: "delete", event: recurring },
      { kind: "delete", event: standalone },
    ]);
    context.pending.resolve();
  });

  test("still skips deleting a series master (scope all/thisAndFollowing never reaches this-scope recording)", () => {
    const context = setup();
    const seriesBase = event({
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    context.queryClient.setQueryData(calendarKey, normalized(seriesBase));

    act(() =>
      context.hook.result.current.mutations.delete({
        id: seriesBase.id,
        scope: "all",
      }),
    );
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    context.pending.resolve();
  });

  test("does not record replays run inside runHistoryRestore", () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    runHistoryRestore(() => {
      act(() =>
        context.hook.result.current.mutations.replace(
          replacePayload(original.id, {
            content: {
              kind: "details",
              title: "Replayed",
              description: "",
              location: "",
            },
          }),
        ),
      );
      act(() =>
        context.hook.result.current.mutations.delete({
          id: original.id,
          scope: "this",
        }),
      );
      act(() =>
        context.hook.result.current.mutations.create({
          id: original.id,
          calendarId: original.calendarId,
          content: original.content as {
            kind: "details";
            title: string;
            description: string;
            location: string;
          },
          schedule: original.schedule as never,
          recurrence: { kind: "single" },
        }),
      );
    });

    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    context.pending.resolve();
  });

  test("tracks event_created for a genuine create", () => {
    track.mockClear();
    const context = setup();
    context.queryClient.setQueryData(calendarKey, normalized());

    act(() =>
      context.hook.result.current.mutations.create({
        calendarId: event().calendarId,
        content: {
          kind: "details",
          title: "New",
          description: "",
          location: "",
        },
        schedule: timedSchedule(
          "2026-07-02T16:00:00.000Z",
          "2026-07-02T17:00:00.000Z",
        ),
        recurrence: { kind: "single" },
      }),
    );

    expect(track).toHaveBeenCalledWith("event_created", {
      event_source: "local",
      recurrence: "single",
    });
    context.pending.resolve();
  });

  test("does not track event_created for an undo/redo replay create", () => {
    track.mockClear();
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.create({
        id: original.id,
        calendarId: original.calendarId,
        content: original.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: original.schedule as never,
        recurrence: { kind: "single" },
        restore: true,
      }),
    );

    expect(track).not.toHaveBeenCalled();
    context.pending.resolve();
  });

  test("defers an undo-restore create until the in-flight delete persists", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.delete({
        id: original.id,
        scope: "this",
      }),
    );
    await waitFor(() => {
      expect(context.calls.some(({ method }) => method === "delete")).toBe(
        true,
      );
    });

    act(() =>
      context.hook.result.current.mutations.create({
        id: original.id,
        calendarId: original.calendarId,
        content: original.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: original.schedule as never,
        recurrence: { kind: "single" },
      }),
    );

    // The POST must not race the still-in-flight DELETE, or the restore
    // could land server-side before the delete and be wiped by it.
    expect(context.calls.some(({ method }) => method === "create")).toBe(false);

    act(() => context.pending.resolveNext());
    await waitFor(() => {
      expect(context.calls.some(({ method }) => method === "create")).toBe(
        true,
      );
    });
    context.pending.resolve();
  });

  test("skips the restore create when the delete fails", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.delete({
        id: original.id,
        scope: "this",
      }),
    );
    await waitFor(() => {
      expect(context.calls.some(({ method }) => method === "delete")).toBe(
        true,
      );
    });

    act(() =>
      context.hook.result.current.mutations.create({
        id: original.id,
        calendarId: original.calendarId,
        content: original.content as {
          kind: "details";
          title: string;
          description: string;
          location: string;
        },
        schedule: original.schedule as never,
        recurrence: { kind: "single" },
      }),
    );
    act(() => context.pending.rejectNext(new Error("delete failed")));

    await waitFor(() => {
      expect(context.errors[0]?.message).toBe("delete failed");
      expect(context.hook.result.current.hasPending).toBe(false);
    });
    // The event still exists server-side, so there is nothing to recreate.
    expect(context.calls.some(({ method }) => method === "create")).toBe(false);
  });
});
