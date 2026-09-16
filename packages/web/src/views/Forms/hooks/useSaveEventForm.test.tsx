import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import {
  CalendarIdSchema,
  type EventId,
  EventIdSchema,
} from "@core/types/domain-primitives";
import {
  type CreateEventInput,
  type EventListQuery,
} from "@core/types/event-command.contracts";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import {
  type MigrationRecord,
  type OfflineDataStore,
  type StoredTask,
} from "@web/common/storage/offline-data/offline-data.store";
import { resetOfflineDataStoreForTests } from "@web/common/storage/offline-data/offline-data.store.registry";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  draftActions,
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { WEEK_INTERACTION_EVENT_ID_ATTRIBUTE } from "@web/grid/interaction/view-event-registry";
import { useSaveEventForm } from "./useSaveEventForm";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

const calendarId = CalendarIdSchema.parse("cccccccccccccccccccccccc");

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(calendarQueryKeys.all, [makeCalendar()]);

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

const createVariables = (queryClient: QueryClient) =>
  queryClient.getMutationCache().getAll()[0]?.state.variables as
    | { input: CreateEventInput }
    | undefined;

let pendingFrames: FrameRequestCallback[];
let originalRequestAnimationFrame: typeof requestAnimationFrame;

const flushFrame = () => {
  const frames = pendingFrames.splice(0);
  frames.forEach((frame) => frame(performance.now()));
};

describe("useSaveEventForm", () => {
  beforeEach(() => {
    draftActions.discard();
    pendingFrames = [];
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((frame: FrameRequestCallback) =>
      pendingFrames.push(frame)) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    document.body.innerHTML = "";
  });

  it("keeps the form open and surfaces field errors when the draft is invalid", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T10:00:00.000Z"),
        new Date("2026-05-20T09:00:00.000Z"),
      ),
      undefined,
      calendarId,
    );
    draftActions.startGridDraft({ activity: "gridClick", draft });
    draftActions.setFormOpen(true);

    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.saveEventForm(draft);
    });

    expect(result.current.fieldErrors.end).toBeDefined();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);
    expect(useDraftStore.getState()).not.toEqual(initialDraftState);
  });

  it("reuses the create draft clientId as the saved event id and focuses that card", async () => {
    const clientId = EventIdSchema.parse("507f1f77bcf86cd799439044");
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000Z"),
        new Date("2026-05-20T10:00:00.000Z"),
      ),
      clientId,
      calendarId,
    );
    draft.values.title = "New standup";
    draftActions.startGridDraft({ activity: "createShortcut", draft });
    draftActions.setFormOpen(true);

    const card = document.createElement("button");
    card.setAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, clientId);
    card.tabIndex = 0;
    document.body.appendChild(card);

    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.saveEventForm(draft);
    });

    expect(createVariables(queryClient)?.input.id).toBe(clientId);
    await waitFor(() => {
      expect(useDraftStore.getState()).toEqual(initialDraftState);
    });
    flushFrame();
    expect(document.activeElement).toBe(card);
  });

  it("mints a create id when the draft has no clientId", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000Z"),
        new Date("2026-05-20T10:00:00.000Z"),
      ),
      undefined,
      calendarId,
    );
    draftActions.startGridDraft({ activity: "gridClick", draft });
    draftActions.setFormOpen(true);

    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.saveEventForm(draft);
    });

    const savedId = createVariables(queryClient)?.input.id;
    expect(savedId).toBeDefined();
    expect(EventIdSchema.safeParse(savedId).success).toBe(true);
  });

  it("restores the submitted draft when local persistence fails", async () => {
    const { port } = createTestToastPort();
    registerToastPort(port);

    const failingStore: OfflineDataStore = {
      initialize: async () => undefined,
      isReady: () => true,
      getEvents: async (_query: EventListQuery) => [],
      getAllEvents: async () => [] as LocalEventRecord[],
      searchByTitle: async () => [],
      putEvent: async () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      putEvents: async () => undefined,
      deleteEvent: async (_eventId: EventId) => undefined,
      clearAllEvents: async () => undefined,
      getAllTasks: async () => [] as StoredTask[],
      getTaskCount: async () => 0,
      clearAllTasks: async () => undefined,
      getMigrationRecords: async () => [] as MigrationRecord[],
      setMigrationRecord: async () => undefined,
    };
    resetOfflineDataStoreForTests(failingStore);

    const clientId = EventIdSchema.parse("507f1f77bcf86cd799439045");
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000Z"),
        new Date("2026-05-20T10:00:00.000Z"),
      ),
      clientId,
      calendarId,
    );
    draft.values.title = "Keep this title";
    draftActions.startGridDraft({ activity: "createShortcut", draft });
    draftActions.setFormOpen(true);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });

    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    try {
      act(() => {
        result.current.saveEventForm(draft);
      });

      await waitFor(() => {
        expect(useDraftStore.getState().status?.isFormOpen).toBe(true);
      });
      expect(useDraftStore.getState().gridDraft?.values.title).toBe(
        "Keep this title",
      );
      expect(useDraftStore.getState().gridDraft).not.toEqual(null);
    } finally {
      consoleError.mockRestore();
      resetOfflineDataStoreForTests();
    }
  });
});
