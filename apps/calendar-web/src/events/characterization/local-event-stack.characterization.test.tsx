import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { act, type PropsWithChildren } from "react";
import {
  CalendarIdSchema,
  DateTimeSchema,
  EventIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import {
  type EventListQuery,
  type ReplaceEventInput,
} from "@core/types/event-command.contracts";
import dayjs from "@core/util/date/dayjs";
import { resetOfflineDataStoreForTests } from "@web/common/storage/offline-data/offline-data.store.registry";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { createInMemoryLocalEventStack } from "@web/events/characterization/in-memory-local-store.harness";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import { useUndoRedo } from "@web/events/mutations/useUndoRedo";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import { recurrenceScopeOpportunityActions } from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { useUndoHistoryStore } from "@web/events/stores/undo.store";
import { afterEach, describe, expect, test } from "bun:test";

const calendarId = CalendarIdSchema.parse("cccccccccccccccccccccccc");
const ny = TimeZoneSchema.parse("America/New_York");

const rangeQuery = {
  kind: "range" as const,
  start: DateTimeSchema.parse("2026-05-03T00:00:00.000Z"),
  end: DateTimeSchema.parse("2026-05-10T00:00:00.000Z"),
};

const dstRangeQuery = {
  kind: "range" as const,
  start: DateTimeSchema.parse("2026-10-29T00:00:00.000Z"),
  end: DateTimeSchema.parse("2026-11-06T00:00:00.000Z"),
};

const weekKey = eventQueryKeys.week({
  source: "local",
  start: "2026-05-03T00:00:00.000Z",
  end: "2026-05-10T00:00:00.000Z",
});

const timedSchedule = (
  start: string,
  end: string,
  timeZone: typeof ny = TimeZoneSchema.parse("UTC"),
) => ({
  kind: "timed" as const,
  start: DateTimeSchema.parse(start),
  end: DateTimeSchema.parse(end),
  timeZone,
});

const sortOccurrences = (events: Event[]) =>
  events
    .filter((entry) => entry.recurrence.kind === "occurrence")
    .sort((left, right) =>
      String(left.schedule.start).localeCompare(String(right.schedule.start)),
    );

const occurrenceTitles = (events: Event[]) =>
  sortOccurrences(events).map((entry) =>
    entry.content.kind === "details" ? entry.content.title : null,
  );

const wallClockStarts = (events: Event[], zone: string) =>
  events
    .filter((entry) => entry.recurrence.kind === "occurrence")
    .map((entry) => {
      if (entry.schedule.kind !== "timed") return null;
      return dayjs(entry.schedule.start).tz(zone).format("YYYY-MM-DD HH:mm");
    })
    .filter(Boolean);

async function listOccurrences(
  repository: ReturnType<typeof createInMemoryLocalEventStack>["repository"],
  query: EventListQuery = rangeQuery,
) {
  const listed = await repository.list(query);
  return listed.filter((entry) => entry.recurrence.kind === "occurrence");
}

async function seedDailySeries(
  repository: ReturnType<typeof createInMemoryLocalEventStack>["repository"],
  {
    start = "2026-05-04T09:00:00.000Z",
    end = "2026-05-04T10:00:00.000Z",
    count = 6,
    title = "Series",
    timeZone = TimeZoneSchema.parse("UTC"),
  } = {},
) {
  return repository.create({
    calendarId,
    content: { kind: "details", title, description: "", location: "" },
    schedule: timedSchedule(start, end, timeZone),
    recurrence: { kind: "series", rules: [`RRULE:FREQ=DAILY;COUNT=${count}`] },
  });
}

function setupMutationHarness(
  repository: ReturnType<typeof createInMemoryLocalEventStack>["repository"],
  weekQueryKey = weekKey,
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  queryClient.setQueryData(weekQueryKey, {
    ids: [],
    entities: {},
  } satisfies NormalizedEventQueryData);

  const dependencies = {
    source: "local" as const,
    repository,
    markWrite: async () => {},
    reportError: () => {},
  };

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const hook = renderHook(
    () => ({
      mutations: useEventMutations(dependencies),
      undoRedo: useUndoRedo(dependencies),
    }),
    { wrapper },
  );

  return { hook, queryClient, dependencies };
}

describe("characterization: local event repository persistence", () => {
  test("create then delete removes the standalone record", async () => {
    const { repository } = createInMemoryLocalEventStack();
    const created = await repository.create({
      calendarId,
      content: {
        kind: "details",
        title: "One-off",
        description: "",
        location: "",
      },
      schedule: timedSchedule(
        "2026-05-04T09:00:00.000Z",
        "2026-05-04T10:00:00.000Z",
      ),
      recurrence: { kind: "single" },
    });

    await repository.delete(created.id, "this");
    await expect(repository.list(rangeQuery)).resolves.toEqual([]);
  });

  test("recurring delete scopes: this, thisAndFollowing, all", async () => {
    const { repository } = createInMemoryLocalEventStack();
    await seedDailySeries(repository, { count: 5 });

    const before = await listOccurrences(repository);
    expect(before).toHaveLength(5);

    const third = before[2]!;
    await repository.delete(third.id, "this");
    expect(await listOccurrences(repository)).toHaveLength(4);

    const { repository: repo2 } = createInMemoryLocalEventStack();
    await seedDailySeries(repo2, { count: 5 });
    const instances = await listOccurrences(repo2);
    await repo2.delete(instances[2]!.id, "thisAndFollowing");
    expect(await listOccurrences(repo2)).toHaveLength(2);

    const { repository: repo3 } = createInMemoryLocalEventStack();
    const base = await seedDailySeries(repo3, { count: 5 });
    await repo3.delete((await listOccurrences(repo3))[0]!.id, "all");
    expect(await listOccurrences(repo3)).toHaveLength(0);
    expect(await repo3.list(rangeQuery)).not.toContainEqual(
      expect.objectContaining({ id: base.id }),
    );
  });

  test("recurring replace scopes: this, thisAndFollowing, all", async () => {
    const { repository } = createInMemoryLocalEventStack();
    await seedDailySeries(repository, { title: "Base" });
    const instances = await listOccurrences(repository);
    const middle = instances[2]!;

    await repository.replace(middle.id, {
      content: {
        kind: "details",
        title: "This only",
        description: "",
        location: "",
      },
      schedule: middle.schedule as ReplaceEventInput["schedule"],
      recurrence: { kind: "preserve" },
      scope: "this",
    });
    expect(occurrenceTitles(await listOccurrences(repository))).toEqual([
      "Base",
      "Base",
      "This only",
      "Base",
      "Base",
      "Base",
    ]);

    const { repository: repo2 } = createInMemoryLocalEventStack();
    await seedDailySeries(repo2, { title: "Leg" });
    const legInstances = await listOccurrences(repo2);
    const pivot = legInstances[2]!;
    await repo2.replace(pivot.id, {
      content: {
        kind: "details",
        title: "New leg",
        description: "",
        location: "",
      },
      schedule: timedSchedule(
        "2026-05-06T11:00:00.000Z",
        "2026-05-06T12:00:00.000Z",
      ),
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=DAILY;COUNT=3"] as never,
      },
      scope: "thisAndFollowing",
    });
    expect(occurrenceTitles(await listOccurrences(repo2))).toEqual([
      "Leg",
      "Leg",
      "New leg",
      "New leg",
      "New leg",
    ]);

    const { repository: repo3 } = createInMemoryLocalEventStack();
    await seedDailySeries(repo3, { title: "All" });
    const allInstances = await listOccurrences(repo3);
    await repo3.replace(allInstances[1]!.id, {
      content: {
        kind: "details",
        title: "Renamed all",
        description: "",
        location: "",
      },
      schedule: timedSchedule(
        "2026-05-05T11:00:00.000Z",
        "2026-05-05T12:00:00.000Z",
      ),
      recurrence: { kind: "preserve" },
      scope: "all",
    });
    expect(occurrenceTitles(await listOccurrences(repo3))).toEqual([
      "Renamed all",
      "Renamed all",
      "Renamed all",
      "Renamed all",
      "Renamed all",
      "Renamed all",
    ]);
  });

  test("US DST fall-back week (Nov 1 2026) scope all title edit leaves wall clocks unchanged", async () => {
    const { repository } = createInMemoryLocalEventStack();
    await repository.create({
      calendarId,
      content: {
        kind: "details",
        title: "Morning",
        description: "",
        location: "",
      },
      schedule: timedSchedule(
        "2026-10-30T13:00:00.000Z",
        "2026-10-30T14:00:00.000Z",
        ny,
      ),
      recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=4"] },
    });

    const instances = await listOccurrences(repository, dstRangeQuery);
    const wallBefore = wallClockStarts(instances, "America/New_York");
    expect(wallBefore).toEqual([
      "2026-10-30 09:00",
      "2026-10-31 09:00",
      "2026-11-01 08:00",
      "2026-11-02 08:00",
    ]);

    await repository.replace(sortOccurrences(instances)[0]!.id, {
      content: {
        kind: "details",
        title: "Morning (all)",
        description: "",
        location: "",
      },
      schedule: instances[0]!.schedule as ReplaceEventInput["schedule"],
      recurrence: { kind: "preserve" },
      scope: "all",
    });

    const after = await listOccurrences(repository, dstRangeQuery);
    expect(occurrenceTitles(after)).toEqual([
      "Morning (all)",
      "Morning (all)",
      "Morning (all)",
      "Morning (all)",
    ]);
    expect(wallClockStarts(after, "America/New_York")).toEqual(wallBefore);
  });
});

describe("characterization: useEventMutations + useUndoRedo on local repository", () => {
  afterEach(() => {
    recurrenceScopeOpportunityActions.reset();
    useUndoHistoryStore.setState({ past: [], future: [] });
    resetOfflineDataStoreForTests();
  });

  test("create, edit, delete, undo, and redo for a standalone event", async () => {
    const { repository } = createInMemoryLocalEventStack();
    const { hook } = setupMutationHarness(repository);
    const id = EventIdSchema.parse(createObjectIdString());

    act(() => {
      hook.result.current.mutations.create({
        id,
        calendarId,
        content: {
          kind: "details",
          title: "Draft",
          description: "",
          location: "",
        },
        schedule: timedSchedule(
          "2026-05-04T09:00:00.000Z",
          "2026-05-04T10:00:00.000Z",
        ),
        recurrence: { kind: "single" },
      });
    });

    await waitFor(() =>
      expect(hook.result.current.undoRedo.canUndo).toBe(true),
    );

    act(() => {
      hook.result.current.mutations.replace({
        id,
        input: {
          content: {
            kind: "details",
            title: "Saved",
            description: "",
            location: "",
          },
          schedule: timedSchedule(
            "2026-05-04T09:00:00.000Z",
            "2026-05-04T10:00:00.000Z",
          ),
          recurrence: { kind: "single" },
          scope: "this",
        },
      });
    });

    await waitFor(async () => {
      const saved = await repository.list(rangeQuery);
      expect(saved[0]?.content).toMatchObject({ title: "Saved" });
    });

    act(() => hook.result.current.mutations.delete({ id, scope: "this" }));
    await waitFor(() =>
      expect(repository.list(rangeQuery)).resolves.toEqual([]),
    );

    act(() => hook.result.current.undoRedo.undo());
    await waitFor(async () => {
      const restored = await repository.list(rangeQuery);
      expect(restored[0]?.content).toMatchObject({ title: "Saved" });
    });

    act(() => hook.result.current.undoRedo.redo());
    await waitFor(() =>
      expect(repository.list(rangeQuery)).resolves.toEqual([]),
    );
  });

  test("recurring occurrence edit at scope this is undoable", async () => {
    const { repository } = createInMemoryLocalEventStack();
    const base = await seedDailySeries(repository, { title: "Before" });
    const listed = await repository.list(rangeQuery);
    const instances = sortOccurrences(listed);
    const target = instances[1]!;
    const { hook, queryClient } = setupMutationHarness(repository);
    queryClient.setQueryData(weekKey, {
      ids: listed.map((entry) => entry.id),
      entities: Object.fromEntries(listed.map((entry) => [entry.id, entry])),
    });

    act(() => {
      hook.result.current.mutations.replace({
        id: target.id,
        input: {
          content: {
            kind: "details",
            title: "After",
            description: "",
            location: "",
          },
          schedule: target.schedule as ReplaceEventInput["schedule"],
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      });
    });

    await waitFor(() =>
      expect(hook.result.current.undoRedo.canUndo).toBe(true),
    );
    await waitFor(async () => {
      expect(occurrenceTitles(await repository.list(rangeQuery))).toEqual([
        "Before",
        "After",
        "Before",
        "Before",
        "Before",
        "Before",
      ]);
    });

    act(() => hook.result.current.undoRedo.undo());
    await waitFor(async () => {
      expect(occurrenceTitles(await listOccurrences(repository))).toEqual([
        "Before",
        "Before",
        "Before",
        "Before",
        "Before",
        "Before",
      ]);
    });

    expect(base.id).toBeDefined();
  });

  test("promoted this-and-following and all writes persist through the repository", async () => {
    const { repository } = createInMemoryLocalEventStack();
    await seedDailySeries(repository, { title: "S" });
    const instances = await listOccurrences(repository);
    const pivot = instances[2]!;

    const { hook, queryClient } = setupMutationHarness(repository);
    queryClient.setQueryData(weekKey, {
      ids: instances.map((entry) => entry.id),
      entities: Object.fromEntries(instances.map((entry) => [entry.id, entry])),
    });

    act(() => {
      hook.result.current.mutations.replace({
        id: pivot.id,
        input: {
          content: {
            kind: "details",
            title: "Following",
            description: "",
            location: "",
          },
          schedule: timedSchedule(
            "2026-05-06T11:00:00.000Z",
            "2026-05-06T12:00:00.000Z",
          ),
          recurrence: {
            kind: "series",
            rules: ["RRULE:FREQ=DAILY;COUNT=2"] as never,
          },
          scope: "thisAndFollowing",
        },
      });
    });

    await waitFor(async () => {
      expect(occurrenceTitles(await listOccurrences(repository))).toEqual([
        "S",
        "S",
        "Following",
        "Following",
      ]);
    });

    const { repository: repoAll } = createInMemoryLocalEventStack();
    await seedDailySeries(repoAll, { title: "A" });
    const allInstances = await listOccurrences(repoAll);
    const { hook: hookAll, queryClient: qcAll } = setupMutationHarness(repoAll);
    qcAll.setQueryData(weekKey, {
      ids: allInstances.map((entry) => entry.id),
      entities: Object.fromEntries(
        allInstances.map((entry) => [entry.id, entry]),
      ),
    });

    act(() => {
      hookAll.result.current.mutations.replace({
        id: allInstances[0]!.id,
        input: {
          content: {
            kind: "details",
            title: "Every",
            description: "",
            location: "",
          },
          schedule: allInstances[0]!.schedule as ReplaceEventInput["schedule"],
          recurrence: { kind: "preserve" },
          scope: "all",
        },
      });
    });

    await waitFor(async () => {
      expect(occurrenceTitles(await listOccurrences(repoAll))).toEqual([
        "Every",
        "Every",
        "Every",
        "Every",
        "Every",
        "Every",
      ]);
    });
  });
});
