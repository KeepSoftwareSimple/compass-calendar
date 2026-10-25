import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import {
  CalendarIdSchema,
  DateTimeSchema,
  EventIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { type ReplaceEventInput } from "@core/types/event-command.contracts";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { resetOfflineDataStoreForTests } from "@web/common/storage/offline-data/offline-data.store.registry";
import { RecurringEventUpdateScope } from "@web/common/types/web.event.types";
import { createInMemoryLocalEventStack } from "@web/events/characterization/in-memory-local-store.harness";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { draftActions } from "@web/events/stores/draft.store";
import { useSaveEventForm } from "@web/views/Forms/hooks/useSaveEventForm";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const calendarId = CalendarIdSchema.parse("cccccccccccccccccccccccc");
const seriesId = EventIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbb");

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: calendarId,
  name: "Personal",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "local",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: true,
  isVisible: true,
  isActive: true,
  ...overrides,
});

const rangeQuery = {
  kind: "range" as const,
  start: DateTimeSchema.parse("2026-05-03T00:00:00.000Z"),
  end: DateTimeSchema.parse("2026-05-10T00:00:00.000Z"),
};

const weekKey = eventQueryKeys.week({
  source: "local",
  start: "2026-05-03T00:00:00.000Z",
  end: "2026-05-10T00:00:00.000Z",
});

const latestReplaceVariables = (queryClient: QueryClient) => {
  const mutations = queryClient
    .getMutationCache()
    .getAll()
    .filter((entry) => entry.options.mutationKey?.[2] === "replace");
  const mutation = mutations.at(-1);
  return mutation?.state.variables as
    | { id: string; input: ReplaceEventInput }
    | undefined;
};

function renderSaveHarness(queryClient: QueryClient) {
  queryClient.setQueryData(calendarQueryKeys.all, [makeCalendar()]);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSaveEventForm(), { wrapper });
}

describe("characterization: EventForm save funnel (useSaveEventForm)", () => {
  beforeEach(() => {
    draftActions.discard();
  });

  afterEach(() => {
    draftActions.discard();
    resetOfflineDataStoreForTests();
  });

  test("maps THIS_EVENT to replace scope this and persists a single occurrence", async () => {
    const { repository, store } = createInMemoryLocalEventStack();
    resetOfflineDataStoreForTests(store);

    await repository.create({
      calendarId,
      content: {
        kind: "details",
        title: "Series",
        description: "",
        location: "",
      },
      schedule: {
        kind: "timed",
        start: DateTimeSchema.parse("2026-05-04T09:00:00.000Z"),
        end: DateTimeSchema.parse("2026-05-04T10:00:00.000Z"),
        timeZone: TimeZoneSchema.parse("UTC"),
      },
      recurrence: { kind: "series", rules: ["RRULE:FREQ=DAILY;COUNT=4"] },
    });

    const listed = await repository.list(rangeQuery);
    const occurrence = listed.find(
      (entry) => entry.recurrence.kind === "occurrence",
    )!;
    const draft = editGridEventDraft(occurrence)!;
    draft.values.title = "This only";

    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    queryClient.setQueryData(weekKey, {
      ids: listed.map((entry) => entry.id),
      entities: Object.fromEntries(listed.map((entry) => [entry.id, entry])),
    });

    const { result } = renderSaveHarness(queryClient);

    act(() => {
      result.current.saveEventForm(draft, RecurringEventUpdateScope.THIS_EVENT);
    });

    await waitFor(() =>
      expect(latestReplaceVariables(queryClient)?.input.scope).toBe("this"),
    );
    await waitFor(async () => {
      const titles = (await repository.list(rangeQuery))
        .filter((entry) => entry.recurrence.kind === "occurrence")
        .map((entry) =>
          entry.content.kind === "details" ? entry.content.title : null,
        );
      expect(titles.filter((title) => title === "This only")).toHaveLength(1);
    });
  });

  test("maps ALL_EVENTS and THIS_AND_FOLLOWING onto replace scopes", async () => {
    const { store } = createInMemoryLocalEventStack();
    resetOfflineDataStoreForTests(store);

    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    const occurrence = {
      id: EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa"),
      calendarId,
      content: { kind: "details" as const, title: "Series", description: "" },
      schedule: {
        kind: "timed" as const,
        start: DateTimeSchema.parse("2026-05-04T09:00:00.000Z"),
        end: DateTimeSchema.parse("2026-05-04T10:00:00.000Z"),
        timeZone: TimeZoneSchema.parse("UTC"),
      },
      recurrence: { kind: "occurrence" as const, seriesId },
      createdAt: DateTimeSchema.parse("2026-05-01T00:00:00.000Z"),
      updatedAt: null,
    };
    const draft = editGridEventDraft(occurrence)!;
    queryClient.setQueryData(weekKey, {
      ids: [occurrence.id],
      entities: { [occurrence.id]: occurrence },
    });

    const { result } = renderSaveHarness(queryClient);

    act(() => {
      result.current.saveEventForm(draft, RecurringEventUpdateScope.ALL_EVENTS);
    });
    await waitFor(() =>
      expect(latestReplaceVariables(queryClient)?.input.scope).toBe("all"),
    );

    act(() => {
      result.current.saveEventForm(
        draft,
        RecurringEventUpdateScope.THIS_AND_FOLLOWING_EVENTS,
      );
    });
    await waitFor(() =>
      expect(latestReplaceVariables(queryClient)?.input.scope).toBe(
        "thisAndFollowing",
      ),
    );
  });
});
