import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { act, type PropsWithChildren } from "react";
import { CalendarIdSchema, type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import {
  type CreateEventInput,
  CreateEventInputSchema,
  type ReplaceEventInput,
} from "@core/types/event-command.contracts";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { useHiddenCalendarIds } from "@web/calendars/calendar-visibility.store";
import { useCalendarVisibility } from "@web/calendars/useCalendarVisibility";
import {
  CALENDAR_VISIBILITY_TOAST_ID,
  EVENT_DELETED_TOAST_ID,
  UNDO_STATUS_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  useHiddenEventIds,
  useToggleEventHidden,
} from "@web/events/hidden/hidden-events.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import { useRecurrenceScopeOpportunityStore } from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { type EventRepository } from "@web/events/repositories/event.repository.types";
import { useUndoHistoryStore } from "@web/events/stores/undo.store";
import { useEventMutations } from "./useEventMutations";
import { useUndoRedo } from "./useUndoRedo";

const calendarKey = eventQueryKeys.week({
  source: "local",
  start: "2026-07-01T00:00:00.000Z",
  end: "2026-07-08T00:00:00.000Z",
});

const event = (overrides: Partial<Event> = {}): Event =>
  createMockEvent({
    content: { kind: "details", title: "Original", description: "" },
    schedule: {
      kind: "timed",
      start: "2026-07-02T16:00:00.000Z" as never,
      end: "2026-07-02T17:00:00.000Z" as never,
      timeZone: "UTC" as never,
    },
    ...overrides,
  });

const normalized = (...events: Event[]): NormalizedEventQueryData => ({
  ids: events.map(({ id }) => id),
  entities: Object.fromEntries(events.map((item) => [item.id, item])),
});

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const calls: Array<{ method: string; value: unknown }> = [];
  const repository: EventRepository = {
    list: async () => [],
    create: async (input: CreateEventInput) => {
      calls.push({ method: "create", value: input });
      return event({ id: (input.id ?? event().id) as EventId });
    },
    replace: async (id: EventId, input: ReplaceEventInput) => {
      calls.push({ method: "replace", value: { id, input } });
      return event({ id });
    },
    delete: async (id: EventId, scope) => {
      calls.push({ method: "delete", value: { id, scope } });
    },
  };
  const dependencies = {
    source: "local" as const,
    repository,
    markWrite: async () => {},
    reportError: () => {},
  };
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  seedHiddenEventIds(queryClient, []);
  const hook = renderHook(
    () => ({
      mutations: useEventMutations(dependencies),
      undoRedo: useUndoRedo(dependencies),
      hidden: useToggleEventHidden(),
      ids: useHiddenEventIds(),
      calendar: useCalendarVisibility(),
      hiddenCalendarIds: useHiddenCalendarIds(),
    }),
    { wrapper },
  );
  return { calls, hook, queryClient, repository };
};

describe("useUndoRedo", () => {
  test("undoes an edit by replaying the before snapshot, redoes with after", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.replace({
        id: original.id,
        input: {
          content: original.content as {
            kind: "details";
            title: string;
            description: string;
            location: string;
          },
          schedule: {
            kind: "timed",
            start: "2026-07-03T16:00:00.000Z" as never,
            end: "2026-07-03T17:00:00.000Z" as never,
            timeZone: "UTC" as never,
          },
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
    });

    act(() => context.hook.result.current.undoRedo.undo());

    await waitFor(() => {
      const schedule =
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].schedule;
      expect(schedule?.kind === "timed" && schedule.start).toBe(
        "2026-07-02T16:00:00.000Z",
      );
    });
    // The replay persisted the before snapshot and did not re-record itself.
    const replayCalls = context.calls.filter(
      ({ method }) => method === "replace",
    );
    expect(replayCalls).toHaveLength(2);
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    expect(context.hook.result.current.undoRedo.canRedo).toBe(true);

    act(() => context.hook.result.current.undoRedo.redo());

    await waitFor(() => {
      const schedule =
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].schedule;
      expect(schedule?.kind === "timed" && schedule.start).toBe(
        "2026-07-03T16:00:00.000Z",
      );
    });
    expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
  });

  test("undoes a create by deleting the event, redoes with create", async () => {
    const context = setup();
    const created = event({
      content: { kind: "details", title: "New event", description: "" },
    });
    context.queryClient.setQueryData(calendarKey, normalized());

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
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[created.id],
      ).toBeDefined();
    });

    act(() => context.hook.result.current.undoRedo.undo());

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });
    const deleteCall = context.calls.find(({ method }) => method === "delete");
    expect(deleteCall?.value).toEqual({ id: created.id, scope: "this" });
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    expect(context.hook.result.current.undoRedo.canRedo).toBe(true);

    act(() => context.hook.result.current.undoRedo.redo());

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[created.id],
      ).toBeDefined();
    });
    const createCalls = context.calls.filter(
      ({ method }) => method === "create",
    );
    expect(createCalls).toHaveLength(2);
    expect((createCalls.at(-1)!.value as CreateEventInput).id).toBe(created.id);
  });

  test("undoes a delete by recreating the snapshot with its original id", async () => {
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
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });

    act(() => context.hook.result.current.undoRedo.undo());

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id],
      ).toBeDefined();
    });
    const createCall = context.calls.find(({ method }) => method === "create");
    expect((createCall!.value as CreateEventInput).id).toBe(original.id);

    act(() => context.hook.result.current.undoRedo.redo());

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });
    expect(
      context.calls.filter(({ method }) => method === "delete"),
    ).toHaveLength(2);
  });

  test("undo of a delete strips provider-sourced fields and recreates only after the server confirms", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const context = setup();
    const original = event({
      content: {
        kind: "details",
        title: "Sync'd meeting",
        description: "",
        organizer: { email: "host@example.com", displayName: "Host" },
        attendees: [
          {
            email: "guest@example.com",
            displayName: "Guest",
            responseStatus: "accepted",
          },
        ],
        conference: { url: "https://meet.example.com/abc", label: "Meet" },
      },
    });
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.delete({
        id: original.id,
        scope: "this",
      }),
    );
    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });

    act(() => context.hook.result.current.undoRedo.undo());

    // The toast must not claim success before the recreate mutation settles.
    expect(mocks.update).not.toHaveBeenCalledWith(
      EVENT_DELETED_TOAST_ID,
      expect.objectContaining({ render: "Restored" }),
    );

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id],
      ).toBeDefined();
    });

    const createCall = context.calls.find(({ method }) => method === "create");
    const payload = createCall?.value as CreateEventInput;
    // The repository never sees organizer/attendees/conference - only the
    // editable subset the strict write schema accepts.
    expect(CreateEventInputSchema.safeParse(payload).success).toBe(true);
    expect(payload.content).not.toHaveProperty("organizer");
    expect(payload.content).not.toHaveProperty("attendees");
    expect(payload.content).not.toHaveProperty("conference");
    // The replay marker that lets sync reopen a colliding terminal command
    // instead of treating this as a no-op replay.
    expect(payload.restore).toBe(true);

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        EVENT_DELETED_TOAST_ID,
        expect.objectContaining({ render: "Restored" }),
      );
    });
  });

  test("undo of a delete shows a failure toast when the recreate is rejected", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
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
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });

    context.repository.create = async () => {
      throw new Error("boom");
    };

    act(() => context.hook.result.current.undoRedo.undo());

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        EVENT_DELETED_TOAST_ID,
        expect.objectContaining({ render: "Couldn't restore the event" }),
      );
    });
    expect(mocks.update).not.toHaveBeenCalledWith(
      EVENT_DELETED_TOAST_ID,
      expect.objectContaining({ render: "Restored" }),
    );
  });

  test("undo and redo toast when history is empty", () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const context = setup();

    act(() => context.hook.result.current.undoRedo.undo());
    expect(mocks.update).toHaveBeenCalledWith(
      UNDO_STATUS_TOAST_ID,
      expect.objectContaining({ render: "Nothing to undo" }),
    );

    act(() => context.hook.result.current.undoRedo.redo());
    expect(mocks.update).toHaveBeenCalledWith(
      UNDO_STATUS_TOAST_ID,
      expect.objectContaining({ render: "Nothing to redo" }),
    );

    expect(context.calls).toEqual([]);
    expect(context.hook.result.current.undoRedo.canUndo).toBe(false);
    expect(context.hook.result.current.undoRedo.canRedo).toBe(false);
  });

  const occurrence = (seriesId: EventId, overrides: Partial<Event> = {}) =>
    event({ recurrence: { kind: "occurrence", seriesId }, ...overrides });

  test("undoes a recurring occurrence delete by replaying it back (un-cancel), not recreating", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const context = setup();
    const seriesId = event().id;
    const instance = occurrence(seriesId);
    context.queryClient.setQueryData(calendarKey, normalized(instance));

    act(() =>
      context.hook.result.current.mutations.delete({
        id: instance.id,
        scope: "this",
      }),
    );
    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });

    act(() => context.hook.result.current.undoRedo.undo());

    expect(mocks.dismiss).toHaveBeenCalledWith(EVENT_DELETED_TOAST_ID);

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[instance.id],
      ).toBeDefined();
    });
    // Replayed via replace (un-cancelling the tombstone) — never create,
    // which would spawn a duplicate standalone event instead of restoring
    // the instance.
    expect(context.calls.some(({ method }) => method === "create")).toBe(false);
    const replayCall = context.calls.find(({ method }) => method === "replace");
    expect(replayCall?.value).toMatchObject({
      id: instance.id,
      input: { scope: "this", recurrence: { kind: "preserve" } },
    });

    act(() => context.hook.result.current.undoRedo.redo());

    await waitFor(() => {
      expect(
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.ids,
      ).toEqual([]);
    });
    // Redo (re-deleting the instance) already worked correctly pre-rewrite —
    // scope "this" on the composed occurrence id.
    const deleteCall = context.calls.find(({ method }) => method === "delete");
    expect(deleteCall?.value).toEqual({ id: instance.id, scope: "this" });
  });

  test("undoes and redoes a recurring occurrence edit", async () => {
    const context = setup();
    const seriesId = event().id;
    const instance = occurrence(seriesId);
    context.queryClient.setQueryData(calendarKey, normalized(instance));

    act(() =>
      context.hook.result.current.mutations.replace({
        id: instance.id,
        input: {
          content: {
            kind: "details",
            title: "Moved",
            description: "",
            location: "",
          },
          schedule: instance.schedule as never,
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
    });

    act(() => context.hook.result.current.undoRedo.undo());

    await waitFor(() => {
      const title =
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[instance.id]?.content;
      expect(title?.kind === "details" && title.title).toBe("Original");
    });
    const replayCalls = context.calls.filter(
      ({ method }) => method === "replace",
    );
    // Both the original edit and the undo replay kept the occurrence linkage
    // via "preserve" (never forced back to a standalone single).
    expect(
      replayCalls.every(
        (call) =>
          (call.value as { input: ReplaceEventInput }).input.recurrence.kind ===
          "preserve",
      ),
    ).toBe(true);
  });

  test("keeps an unrelated live recurrence offer when undoing a later change", async () => {
    const context = setup();
    const seriesId = event().id;
    const instance = occurrence(seriesId);
    const other = event({
      content: { kind: "details", title: "Other", description: "" },
    });
    context.queryClient.setQueryData(calendarKey, normalized(instance, other));

    act(() =>
      context.hook.result.current.mutations.replace({
        id: instance.id,
        input: {
          content: {
            kind: "details",
            title: "Changed",
            description: "",
            location: "",
          },
          schedule: instance.schedule as never,
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      }),
    );
    await waitFor(() =>
      expect(
        useRecurrenceScopeOpportunityStore.getState().opportunity,
      ).toMatchObject({
        original: { id: instance.id },
        status: "ready",
      }),
    );

    act(() =>
      context.hook.result.current.mutations.replace({
        id: other.id,
        input: {
          content: {
            kind: "details",
            title: "Later",
            description: "",
            location: "",
          },
          schedule: other.schedule as never,
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
    });

    act(() => context.hook.result.current.undoRedo.undo());

    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toMatchObject({
      original: { id: instance.id },
      status: "ready",
    });
  });

  test("declines an edit undo when the event changed since it was recorded (stale)", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.replace({
        id: original.id,
        input: {
          content: {
            kind: "details",
            title: "Moved",
            description: "",
            location: "",
          },
          schedule: original.schedule as never,
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
    });

    // Something ELSE (an SSE-driven refetch, another tab) changed the event
    // to different content after the edit landed — simulated directly on the
    // cache, bypassing our own mutation path.
    context.queryClient.setQueryData(
      calendarKey,
      normalized({
        ...original,
        id: original.id,
        content: {
          kind: "details",
          title: "Changed elsewhere",
          description: "",
        },
      }),
    );
    const callsBeforeUndo = context.calls.length;

    act(() => context.hook.result.current.undoRedo.undo());

    // Declined: no new replace call, and the entry is simply gone — not
    // silently moved to the redo stack either.
    expect(context.calls).toHaveLength(callsBeforeUndo);
    expect(context.hook.result.current.undoRedo.canUndo).toBe(false);
    expect(context.hook.result.current.undoRedo.canRedo).toBe(false);
  });

  // Regression: a demo-seeded event (or any Event built outside the normal
  // create mutation) has no `color` key at all, while the cache's live copy
  // picks one up as an explicit `color: null` once it passes through a
  // mutation's optimistic merge. Comparing the two shapes directly used to
  // read as "the event changed since this entry was recorded" and silently
  // decline the redo — even though nothing about the event actually changed.
  test("does not decline a redo when only the presence of a null `color` key differs", async () => {
    const context = setup();
    const original = event(); // content has no `color` key, like a demo seed.
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.mutations.replace({
        id: original.id,
        input: {
          content: original.content as {
            kind: "details";
            title: string;
            description: string;
            location: string;
          },
          schedule: {
            kind: "timed",
            start: "2026-07-03T16:00:00.000Z" as never,
            end: "2026-07-03T17:00:00.000Z" as never,
            timeZone: "UTC" as never,
          },
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
    });

    act(() => context.hook.result.current.undoRedo.undo());
    await waitFor(() => {
      expect(context.hook.result.current.undoRedo.canRedo).toBe(true);
    });

    // Simulate what a real optimistic merge leaves behind: the same content
    // and schedule the undo just restored, but with an explicit `color: null`
    // the original snapshot never had.
    const current =
      context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
        ?.entities[original.id];
    context.queryClient.setQueryData(
      calendarKey,
      normalized({
        ...(current as Event),
        content: { ...(current as Event).content, color: null } as never,
      }),
    );

    act(() => context.hook.result.current.undoRedo.redo());

    await waitFor(() => {
      const schedule =
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id].schedule;
      expect(schedule?.kind === "timed" && schedule.start).toBe(
        "2026-07-03T16:00:00.000Z",
      );
    });
    expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
  });

  test("undoes a hide by restoring visibility, redo hides again, replay records nothing", async () => {
    const context = setup();
    const original = event();
    context.queryClient.setQueryData(calendarKey, normalized(original));

    act(() =>
      context.hook.result.current.hidden.toggleEventHidden(original.id),
    );
    await waitFor(() => {
      expect(context.hook.result.current.ids.has(original.id)).toBe(true);
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
    });
    expect(useUndoHistoryStore.getState().past).toEqual([
      { kind: "hidden", eventId: original.id, hidden: true },
    ]);

    act(() => context.hook.result.current.undoRedo.undo());

    await waitFor(() => {
      expect(context.hook.result.current.ids.has(original.id)).toBe(false);
    });
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    expect(context.hook.result.current.undoRedo.canRedo).toBe(true);

    act(() => context.hook.result.current.undoRedo.redo());

    await waitFor(() => {
      expect(context.hook.result.current.ids.has(original.id)).toBe(true);
    });
    expect(useUndoHistoryStore.getState().past).toEqual([
      { kind: "hidden", eventId: original.id, hidden: true },
    ]);
    expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
  });

  test("undoes a series create with a scope-all delete", async () => {
    const context = setup();
    const created = event({
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    context.queryClient.setQueryData(calendarKey, normalized());

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
        recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
    });

    act(() => context.hook.result.current.undoRedo.undo());

    await waitFor(() => {
      expect(context.calls.some(({ method }) => method === "delete")).toBe(
        true,
      );
    });
    const deleteCall = context.calls.find(({ method }) => method === "delete");
    expect(deleteCall?.value).toEqual({ id: created.id, scope: "all" });
  });

  test("undoes hiding a calendar, toasts Showing X calendar, and redo re-hides it", () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const context = setup();
    const calendarId = CalendarIdSchema.parse(createObjectIdString());

    act(() =>
      context.hook.result.current.calendar.toggleCalendarVisibility(
        calendarId,
        false,
        "Work",
      ),
    );
    expect(context.hook.result.current.hiddenCalendarIds.has(calendarId)).toBe(
      true,
    );
    expect(useUndoHistoryStore.getState().past).toEqual([
      {
        kind: "calendarVisibility",
        calendarId,
        label: "Work",
        isVisible: false,
      },
    ]);

    act(() => context.hook.result.current.undoRedo.undo());

    expect(context.hook.result.current.hiddenCalendarIds.has(calendarId)).toBe(
      false,
    );
    expect(mocks.update).toHaveBeenCalledWith(
      CALENDAR_VISIBILITY_TOAST_ID,
      expect.objectContaining({ render: "Showing Work calendar" }),
    );
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    expect(context.hook.result.current.undoRedo.canRedo).toBe(true);

    act(() => context.hook.result.current.undoRedo.redo());

    expect(context.hook.result.current.hiddenCalendarIds.has(calendarId)).toBe(
      true,
    );
    expect(mocks.update).toHaveBeenCalledWith(
      CALENDAR_VISIBILITY_TOAST_ID,
      expect.objectContaining({ render: "Hidden Work calendar" }),
    );
    expect(useUndoHistoryStore.getState().past).toHaveLength(1);
  });

  test("a scope-all edit toasts instead of undoing the previous entry; a second undo then undoes it", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const context = setup();
    const original = event();
    const other = event({
      content: { kind: "details", title: "Other", description: "" },
    });
    context.queryClient.setQueryData(calendarKey, normalized(original, other));

    act(() =>
      context.hook.result.current.mutations.replace({
        id: original.id,
        input: {
          content: {
            kind: "details",
            title: "Moved",
            description: "",
            location: "",
          },
          schedule: original.schedule as never,
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      }),
    );
    await waitFor(() => {
      expect(context.hook.result.current.undoRedo.canUndo).toBe(true);
    });

    act(() =>
      context.hook.result.current.mutations.replace({
        id: other.id,
        input: {
          content: {
            kind: "details",
            title: "Series",
            description: "",
            location: "",
          },
          schedule: other.schedule as never,
          recurrence: { kind: "preserve" },
          scope: "all",
        },
      }),
    );
    await waitFor(() => {
      expect(useUndoHistoryStore.getState().past.at(-1)).toEqual({
        kind: "unrecorded",
      });
    });
    const recordedBeforeMarker = useUndoHistoryStore
      .getState()
      .past.filter((entry) => entry.kind !== "unrecorded");
    expect(recordedBeforeMarker).toHaveLength(1);

    act(() => context.hook.result.current.undoRedo.undo());

    expect(mocks.update).toHaveBeenCalledWith(
      UNDO_STATUS_TOAST_ID,
      expect.objectContaining({ render: "Can't undo the last change" }),
    );
    expect(useUndoHistoryStore.getState().past).toEqual(recordedBeforeMarker);
    expect(
      context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
        ?.entities[original.id]?.content,
    ).toMatchObject({ title: "Moved" });

    act(() => context.hook.result.current.undoRedo.undo());

    await waitFor(() => {
      const title =
        context.queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[original.id]?.content;
      expect(title?.kind === "details" && title.title).toBe("Original");
    });
    expect(mocks.update).not.toHaveBeenCalledWith(
      UNDO_STATUS_TOAST_ID,
      expect.objectContaining({ render: "Nothing to undo" }),
    );
  });

  test("two consecutive unrecorded writes collapse to one marker", async () => {
    const context = setup();
    const first = event();
    const second = event({
      content: { kind: "details", title: "Second", description: "" },
    });
    context.queryClient.setQueryData(calendarKey, normalized(first, second));

    act(() =>
      context.hook.result.current.mutations.replace({
        id: first.id,
        input: {
          content: first.content as {
            kind: "details";
            title: string;
            description: string;
            location: string;
          },
          schedule: first.schedule as never,
          recurrence: { kind: "preserve" },
          scope: "all",
        },
      }),
    );
    act(() =>
      context.hook.result.current.mutations.replace({
        id: second.id,
        input: {
          content: second.content as {
            kind: "details";
            title: string;
            description: string;
            location: string;
          },
          schedule: second.schedule as never,
          recurrence: { kind: "preserve" },
          scope: "all",
        },
      }),
    );
    await waitFor(() => {
      expect(useUndoHistoryStore.getState().past).toEqual([
        { kind: "unrecorded" },
      ]);
    });
  });
});
