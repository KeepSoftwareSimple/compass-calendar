import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type PropsWithChildren, type ReactNode } from "react";
import { type CalendarId } from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  resetBillingGateAttentionForTests,
  setBillingGateOwnsScreen,
} from "@web/billing/billing-gate-attention";
import { billingPreviewActions } from "@web/billing/billing-preview.store";
import {
  resetGuestRsvpNoticeForTests,
  useGuestRsvpNotice,
} from "@web/booking/useGuestRsvpNotice";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import * as realRouters from "@web/routers";
import {
  resetEffectiveTimeZoneStoreForTests,
  setEffectiveTimeZoneForTests,
} from "@web/timezone/effective-timezone.store";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";

const mockNavigate = mock();
mockModuleForFile("@web/routers", realRouters, {
  router: { navigate: mockNavigate },
});

const HOST_EMAIL = "host@example.com";
const chicagoSlot = "2026-09-24T17:00:00.000Z";

const hostSchedule = EventScheduleSchema.parse({
  kind: "timed",
  start: chicagoSlot,
  end: "2026-09-24T17:30:00.000Z",
  timeZone: "America/Chicago",
});

const authenticatedSession = {
  authenticated: true,
  setAuthenticated: () => {},
};

const bobGuest = (
  responseStatus: Attendee["responseStatus"] = "needsAction",
): Attendee => ({
  email: "bob@example.com",
  displayName: "Bob",
  responseStatus,
});

const hostEvent = (
  calendarId: CalendarId,
  overrides: Partial<Event> = {},
): Event =>
  createMockEvent({
    calendarId,
    schedule: hostSchedule,
    content: {
      kind: "details",
      title: "Guest sync",
      description: "",
      organizer: { email: HOST_EMAIL, displayName: "Host" },
      attendees: [bobGuest()],
    },
    ...overrides,
  });

const normalized = (...events: Event[]): NormalizedEventQueryData => ({
  ids: events.map(({ id }) => id),
  entities: Object.fromEntries(events.map((item) => [item.id, item])),
});

const weekKey = eventQueryKeys.week({
  source: "remote",
  start: "2026-09-20T00:00:00.000Z",
  end: "2026-09-28T00:00:00.000Z",
});

function Authenticated({ children }: PropsWithChildren) {
  return (
    <SessionContext.Provider value={authenticatedSession}>
      {children}
    </SessionContext.Provider>
  );
}

describe("useGuestRsvpNotice", () => {
  const { port, mocks } = createTestToastPort();
  let queryClient: QueryClient;
  let hostCalendar: ReturnType<typeof createMockCalendar>;

  beforeEach(() => {
    mocks.toast.mockClear();
    mocks.dismiss.mockClear();
    mockNavigate.mockClear();
    registerToastPort(port);
    resetGuestRsvpNoticeForTests();
    setEffectiveTimeZoneForTests("America/Chicago");
    setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
    hostCalendar = createMockCalendar({ accountEmail: HOST_EMAIL });
    bobEventId = hostEvent(hostCalendar.id).id;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(calendarQueryKeys.all, [hostCalendar]);
  });

  afterEach(() => {
    resetBillingGateAttentionForTests();
    resetGuestRsvpNoticeForTests();
    resetEffectiveTimeZoneStoreForTests();
    setSystemTime();
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <Authenticated>{children}</Authenticated>
    </QueryClientProvider>
  );

  const renderNotice = () =>
    renderHook(() => useGuestRsvpNotice(), { wrapper });

  const pushEvents = (...events: Event[]) => {
    act(() => {
      queryClient.setQueryData(weekKey, normalized(...events));
    });
  };

  const renderedToast = () => {
    const calls = mocks.toast.mock.calls as unknown as unknown[][];
    const content = calls[0]?.[0];
    expect(content).toBeTruthy();
    let view!: ReturnType<typeof render>;
    act(() => {
      view = render(<HotkeysProvider>{content as ReactNode}</HotkeysProvider>);
    });
    return view;
  };

  let bobEventId: Event["id"];

  const eventWithBob = (status: Attendee["responseStatus"]) =>
    hostEvent(hostCalendar.id, {
      id: bobEventId,
      content: {
        kind: "details",
        title: "Guest sync",
        description: "",
        organizer: { email: HOST_EMAIL, displayName: "Host" },
        attendees: [bobGuest(status)],
      },
    });

  it("seeds silently then toasts when a guest accepts", async () => {
    renderNotice();
    pushEvents(eventWithBob("needsAction"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.toast).not.toHaveBeenCalled();

    pushEvents(eventWithBob("accepted"));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalled();
    });
    renderedToast();
    expect(
      screen.getByText("Bob accepted: Thu, Sep 24, 12:00 PM"),
    ).toBeInTheDocument();
  });

  it("shows declined and tentative copy", async () => {
    renderNotice();
    pushEvents(eventWithBob("needsAction"));

    pushEvents(eventWithBob("declined"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    renderedToast();
    expect(
      screen.getByText("Bob declined: Thu, Sep 24, 12:00 PM"),
    ).toBeInTheDocument();

    mocks.toast.mockClear();
    resetGuestRsvpNoticeForTests();
    pushEvents(eventWithBob("needsAction"));
    pushEvents(eventWithBob("tentative"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    renderedToast();
    expect(
      screen.getByText("Bob replied maybe: Thu, Sep 24, 12:00 PM"),
    ).toBeInTheDocument();
  });

  it("uses plural copy for two replies in one refetch", async () => {
    const calendar = hostCalendar;
    const alice: Attendee = {
      email: "alice@example.com",
      displayName: "Alice",
      responseStatus: "needsAction",
    };
    const seeded = createMockEvent({
      calendarId: calendar.id,
      schedule: hostSchedule,
      content: {
        kind: "details",
        title: "Standup",
        description: "",
        organizer: { email: HOST_EMAIL, displayName: "Host" },
        attendees: [bobGuest("needsAction"), alice],
      },
    });
    const updated = createMockEvent({
      calendarId: calendar.id,
      schedule: hostSchedule,
      id: seeded.id,
      content: {
        kind: "details",
        title: "Standup",
        description: "",
        organizer: { email: HOST_EMAIL, displayName: "Host" },
        attendees: [
          bobGuest("accepted"),
          { ...alice, responseStatus: "declined" },
        ],
      },
    });

    renderNotice();
    pushEvents(seeded);
    pushEvents(updated);

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    renderedToast();
    expect(
      screen.getByText(
        "2 guests replied. Latest: Alice declined, Thu, Sep 24, 12:00 PM",
      ),
    ).toBeInTheDocument();
  });

  it("ignores events the host does not organize", async () => {
    const inviteeEvent = createMockEvent({
      calendarId: hostCalendar.id,
      schedule: hostSchedule,
      content: {
        kind: "details",
        title: "Someone else's meeting",
        description: "",
        organizer: { email: "other@example.com", displayName: "Other" },
        attendees: [bobGuest("needsAction")],
      },
    });
    const accepted = createMockEvent({
      ...inviteeEvent,
      id: inviteeEvent.id,
      content: {
        kind: "details",
        title: "Someone else's meeting",
        description: "",
        organizer: { email: "other@example.com", displayName: "Other" },
        attendees: [bobGuest("accepted")],
      },
    });

    renderNotice();
    pushEvents(inviteeEvent);
    pushEvents(accepted);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("ignores the host's own RSVP change", async () => {
    const selfAttendee: Attendee = {
      email: HOST_EMAIL,
      displayName: "Host",
      responseStatus: "needsAction",
    };
    const withSelf = createMockEvent({
      calendarId: hostCalendar.id,
      schedule: hostSchedule,
      content: {
        kind: "details",
        title: "Host RSVP",
        description: "",
        organizer: { email: HOST_EMAIL, displayName: "Host" },
        attendees: [selfAttendee, bobGuest("needsAction")],
      },
    });
    const selfAccepted = createMockEvent({
      ...withSelf,
      id: withSelf.id,
      content: {
        kind: "details",
        title: "Host RSVP",
        description: "",
        organizer: { email: HOST_EMAIL, displayName: "Host" },
        attendees: [
          { ...selfAttendee, responseStatus: "accepted" },
          bobGuest("needsAction"),
        ],
      },
    });

    renderNotice();
    pushEvents(withSelf);
    pushEvents(selfAccepted);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("does not toast when a guest moves to needsAction", async () => {
    renderNotice();
    pushEvents(eventWithBob("accepted"));
    pushEvents(eventWithBob("needsAction"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("Show navigates to the event week", async () => {
    renderNotice();
    pushEvents(eventWithBob("needsAction"));
    pushEvents(eventWithBob("accepted"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    renderedToast();

    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/week/$dateString",
        params: { dateString: "2026-09-24" },
      });
    });
  });

  it("defers the toast until the billing gate is released", async () => {
    setBillingGateOwnsScreen(true);
    renderNotice();
    pushEvents(eventWithBob("needsAction"));
    pushEvents(eventWithBob("accepted"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.toast).not.toHaveBeenCalled();

    act(() => {
      billingPreviewActions.enter();
    });

    expect(mocks.toast).toHaveBeenCalled();
    renderedToast();
    expect(
      screen.getByText("Bob accepted: Thu, Sep 24, 12:00 PM"),
    ).toBeInTheDocument();
  });
});
