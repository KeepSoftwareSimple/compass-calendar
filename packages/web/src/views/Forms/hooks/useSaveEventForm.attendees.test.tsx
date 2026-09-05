import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema, EventIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import {
  type CreateEventInput,
  type ReplaceEventInput,
} from "@core/types/event-command.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { RecurringEventUpdateScope } from "@web/common/types/web.event.types";
import {
  createGridEventDraft,
  editGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";
import { useSaveEventForm } from "./useSaveEventForm";
import { beforeEach, describe, expect, it } from "bun:test";

// WP-04: guest-set change detection, the save-time "Send invitation emails?"
// prompt, and the payloads each choice produces. Payload assertions read the
// mutation variables at the useEventMutations funnel — the exact input every
// repository receives; the byte-level wire assertion (through MSW) lives in
// useEventMutations.attendees.test.tsx.

const calendarId = CalendarIdSchema.parse("cccccccccccccccccccccccc");

const providerCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: calendarId,
  name: "Work",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail: "me@example.com",
  ...overrides,
});

const googleCalendar = providerCalendar;

const meetingEvent = (overrides: Partial<Event> = {}): Event =>
  createMockEvent({
    calendarId,
    content: {
      kind: "details",
      title: "Weekly sync",
      description: "",
      attendees: [
        {
          email: "guest@example.com",
          displayName: null,
          responseStatus: "accepted",
        },
      ],
    },
    ...overrides,
  });

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(calendarQueryKeys.all, [googleCalendar()]);

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

const editDraftOrThrow = (event: Event) => {
  const draft = editGridEventDraft(event);
  if (!draft) throw new Error("expected an edit draft");
  return draft;
};

const replaceVariables = (queryClient: QueryClient) =>
  queryClient.getMutationCache().getAll()[0]?.state.variables as
    | { id: string; input: ReplaceEventInput }
    | undefined;

const createVariables = (queryClient: QueryClient) =>
  queryClient.getMutationCache().getAll()[0]?.state.variables as
    | { input: CreateEventInput }
    | undefined;

describe("useSaveEventForm guest edits", () => {
  beforeEach(() => {
    draftActions.discard();
  });

  it("saves an untouched guest list with no prompt, omitting attendees and invitation", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = editDraftOrThrow(meetingEvent());

    act(() => {
      result.current.saveEventForm(draft);
    });

    expect(result.current.invitationPrompt).toBeNull();
    const variables = replaceVariables(queryClient);
    expect(variables).toBeDefined();
    expect(variables?.input.content).not.toContainKey("attendees");
    expect(variables?.input).not.toContainKey("invitation");
  });

  it("treats a touched-but-unchanged guest list (case-insensitive) as untouched", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = editDraftOrThrow(meetingEvent());
    draft.values.attendees = [
      { email: "GUEST@example.com", displayName: null },
    ];

    act(() => {
      result.current.saveEventForm(draft);
    });

    expect(result.current.invitationPrompt).toBeNull();
    const variables = replaceVariables(queryClient);
    expect(variables?.input.content).not.toContainKey("attendees");
    expect(variables?.input).not.toContainKey("invitation");
  });

  it("prompts before saving a changed guest set; Send maps to invitation 'all'", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = editDraftOrThrow(meetingEvent());
    draft.values.attendees = [
      { email: "guest@example.com", displayName: null },
      { email: "new-guest@example.com", displayName: null },
    ];

    act(() => {
      result.current.saveEventForm(draft);
    });

    // Nothing saved yet - the invitation choice comes first.
    expect(result.current.invitationPrompt).not.toBeNull();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);

    act(() => {
      result.current.invitationPrompt?.onSend();
    });

    expect(result.current.invitationPrompt).toBeNull();
    const variables = replaceVariables(queryClient);
    expect(variables?.input.content.attendees).toEqual([
      { email: "guest@example.com", displayName: null },
      { email: "new-guest@example.com", displayName: null },
    ]);
    expect(variables?.input.invitation).toBe("all");
  });

  it("maps Don't send to invitation 'none'", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = editDraftOrThrow(meetingEvent());
    draft.values.attendees = [];

    act(() => {
      result.current.saveEventForm(draft);
    });
    act(() => {
      result.current.invitationPrompt?.onDontSend();
    });

    const variables = replaceVariables(queryClient);
    // Removing every guest is still an explicit replace-with-empty-set.
    expect(variables?.input.content.attendees).toEqual([]);
    expect(variables?.input.invitation).toBe("none");
  });

  it("cancelling the prompt abandons the save entirely", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = editDraftOrThrow(meetingEvent());
    draft.values.attendees = [];

    act(() => {
      result.current.saveEventForm(draft);
    });
    act(() => {
      result.current.invitationPrompt?.onCancel();
    });

    expect(result.current.invitationPrompt).toBeNull();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("prompts for a create draft that added guests and threads them into the create input", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T10:00:00.000Z"),
        new Date("2026-05-20T11:00:00.000Z"),
      ),
      undefined,
      calendarId,
    );
    draft.values.attendees = [
      { email: "new-guest@example.com", displayName: null },
    ];

    act(() => {
      result.current.saveEventForm(draft);
    });
    expect(result.current.invitationPrompt).not.toBeNull();

    act(() => {
      result.current.invitationPrompt?.onSend();
    });

    const variables = createVariables(queryClient);
    expect(variables?.input.content.attendees).toEqual([
      { email: "new-guest@example.com", displayName: null },
    ]);
    expect(variables?.input.invitation).toBe("all");
  });

  it("keeps attendee edits for any provider with canInviteAttendees", () => {
    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData(calendarQueryKeys.all, [
      providerCalendar({
        provider: "microsoft",
        capabilities: {
          ...getCalendarCapabilities("owner"),
          canInviteAttendees: true,
        },
      }),
    ]);
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T10:00:00.000Z"),
        new Date("2026-05-20T11:00:00.000Z"),
      ),
      undefined,
      calendarId,
    );
    draft.values.attendees = [
      { email: "new-guest@example.com", displayName: null },
    ];

    act(() => {
      result.current.saveEventForm(draft);
    });
    act(() => {
      result.current.invitationPrompt?.onSend();
    });

    const variables = createVariables(queryClient);
    expect(variables?.input.content.attendees).toEqual([
      { email: "new-guest@example.com", displayName: null },
    ]);
    expect(variables?.input.invitation).toBe("all");
  });

  it("drops a guest edit on a recurring event saved at a non-'all' scope (belt behind the UI gates)", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = editDraftOrThrow(
      meetingEvent({
        recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
      }),
    );
    draft.values.attendees = [
      { email: "guest@example.com", displayName: null },
      { email: "new-guest@example.com", displayName: null },
    ];

    act(() => {
      result.current.saveEventForm(draft, RecurringEventUpdateScope.THIS_EVENT);
    });

    // Dropped back to preserve semantics: no prompt, no attendees on the wire.
    expect(result.current.invitationPrompt).toBeNull();
    const variables = replaceVariables(queryClient);
    expect(variables?.input.scope).toBe("this");
    expect(variables?.input.content).not.toContainKey("attendees");
    expect(variables?.input).not.toContainKey("invitation");
  });

  it("keeps a recurring guest edit when saved series-wide ('all' scope)", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = editDraftOrThrow(
      meetingEvent({
        recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
      }),
    );
    draft.values.attendees = [
      { email: "guest@example.com", displayName: null },
      { email: "new-guest@example.com", displayName: null },
    ];

    act(() => {
      result.current.saveEventForm(draft, RecurringEventUpdateScope.ALL_EVENTS);
    });
    act(() => {
      result.current.invitationPrompt?.onSend();
    });

    const variables = replaceVariables(queryClient);
    expect(variables?.input.scope).toBe("all");
    expect(variables?.input.content.attendees).toHaveLength(2);
    expect(variables?.input.invitation).toBe("all");
  });

  // The grid only ever opens occurrences of a series, so this is the path a
  // real guest edit on a repeating event takes: resolveRecurrenceScopeDecision
  // widens it to "all" and normalizeGuestEdit must let it through intact.
  it("keeps a guest edit made on one occurrence of a series", () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEventForm(), {
      wrapper: Wrapper,
    });
    const draft = editDraftOrThrow(
      meetingEvent({
        recurrence: {
          kind: "occurrence",
          seriesId: EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa"),
        },
      }),
    );
    draft.values.attendees = [
      { email: "guest@example.com", displayName: null },
      { email: "new-guest@example.com", displayName: null },
    ];

    act(() => {
      result.current.saveEventForm(draft, RecurringEventUpdateScope.ALL_EVENTS);
    });
    act(() => {
      result.current.invitationPrompt?.onSend();
    });

    const variables = replaceVariables(queryClient);
    expect(variables?.input.scope).toBe("all");
    expect(variables?.input.content.attendees).toHaveLength(2);
    expect(variables?.input.invitation).toBe("all");
  });
});
