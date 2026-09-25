import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type CreateEventInput } from "@core/types/event-command.contracts";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";
import { useSaveEventForm } from "./useSaveEventForm";
import { beforeEach, describe, expect, it } from "bun:test";

// The meeting-link request rides the create input only when the target
// calendar can mint a link; the belt below the switch's render gate drops it
// otherwise (the flag can outlive a calendar change within the same draft).

const calendarId = CalendarIdSchema.parse("cccccccccccccccccccccccc");

const calendarWithKinds = (
  conferenceKinds: Calendar["capabilities"]["conferenceKinds"],
): Calendar => ({
  id: calendarId,
  name: "Work",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: { ...getCalendarCapabilities("owner"), conferenceKinds },
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail: "me@example.com",
});

function createWrapper(calendar: Calendar) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(calendarQueryKeys.all, [calendar]);

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

const createVariables = (queryClient: QueryClient) =>
  queryClient.getMutationCache().getAll()[0]!.state.variables as
    | { input: CreateEventInput }
    | undefined;

const draftRequestingLink = () => {
  const draft = createGridEventDraft(
    timedGridSchedule(
      new Date("2026-05-20T10:00:00.000Z"),
      new Date("2026-05-20T11:00:00.000Z"),
    ),
    undefined,
    calendarId,
  );
  if (draft.kind !== "create") throw new Error("expected a create draft");
  draft.values.createConference = true;
  return draft;
};

describe("useSaveEventForm meeting link", () => {
  beforeEach(() => {
    draftActions.discard();
  });

  it("threads createConference into the create input for a calendar that can mint a link", () => {
    const { queryClient, Wrapper } = createWrapper(calendarWithKinds(["meet"]));
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.saveEventForm(draftRequestingLink());
    });

    expect(createVariables(queryClient)?.input).toMatchObject({
      createConference: true,
    });
  });

  it("drops the request when the target calendar cannot mint a link", () => {
    const { queryClient, Wrapper } = createWrapper(calendarWithKinds([]));
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.saveEventForm(draftRequestingLink());
    });

    const variables = createVariables(queryClient);
    expect(variables).toBeDefined();
    expect(variables?.input).not.toContainKey("createConference");
  });
});
