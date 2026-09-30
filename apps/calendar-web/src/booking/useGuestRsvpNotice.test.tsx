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
import { EventScheduleSchema } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { toNormalizedEventQueryData } from "@web/__tests__/utils/event-query-test-data";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import {
  resetBillingGateAttentionForTests,
  setBillingGateOwnsScreen,
} from "@web/billing/billing-gate-attention";
import {
  resetGuestRsvpNoticeForTests,
  useGuestRsvpNotice,
} from "@web/booking/useGuestRsvpNotice";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
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

const weekKey = eventQueryKeys.week({
  source: "remote",
  start: "2026-09-20T00:00:00.000Z",
  end: "2026-09-28T00:00:00.000Z",
});

const meetingSchedule = EventScheduleSchema.parse({
  kind: "timed",
  start: chicagoSlot,
  end: "2026-09-24T17:30:00.000Z",
  timeZone: "America/Chicago",
});

const hostSelf = (
  responseStatus: Attendee["responseStatus"] = "accepted",
): Attendee => ({
  email: HOST_EMAIL,
  displayName: "Host",
  responseStatus,
});

const guestBob = (
  responseStatus: Attendee["responseStatus"] = "needsAction",
): Attendee => ({
  email: "bob@example.com",
  displayName: "Bob",
  responseStatus,
});

const guestAnn = (
  responseStatus: Attendee["responseStatus"] = "needsAction",
): Attendee => ({
  email: "ann@example.com",
  displayName: "Ann",
  responseStatus,
});

const hostOrganizedEvent = (
  attendees: Attendee[],
  organizerEmail: string = HOST_EMAIL,
) =>
  createMockEvent({
    schedule: meetingSchedule,
    content: {
      kind: "details",
      title: "Planning",
      description: "",
      organizer: { email: organizerEmail, displayName: null },
      attendees,
    },
  });

const authenticatedSession = {
  authenticated: true,
  setAuthenticated: () => {},
};

function flushMicrotasks() {
  return act(async () => {
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });
  });
}

describe("useGuestRsvpNotice", () => {
  const { port, mocks } = createTestToastPort();
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.toast.mockClear();
    mocks.dismiss.mockClear();
    mockNavigate.mockClear();
    registerToastPort(port);
    resetGuestRsvpNoticeForTests();
    setEffectiveTimeZoneForTests("America/Chicago");
    setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
    userMetadataActions.set({
      connections: [createMockConnection(HOST_EMAIL)],
    });
  });

  afterEach(() => {
    resetBillingGateAttentionForTests();
    resetGuestRsvpNoticeForTests();
    resetEffectiveTimeZoneStoreForTests();
    setSystemTime();
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <SessionContext.Provider value={authenticatedSession}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionContext.Provider>
  );

  const mountNotice = () => renderHook(() => useGuestRsvpNotice(), { wrapper });

  const pushWeekEvents = (events: ReturnType<typeof createMockEvent>[]) => {
    act(() => {
      queryClient.setQueryData(weekKey, toNormalizedEventQueryData(events));
    });
  };

  const renderedToast = () => {
    const calls = mocks.toast.mock.calls as unknown as unknown[][];
    const content = calls.at(-1)?.[0];
    expect(content).toBeTruthy();
    let view!: ReturnType<typeof render>;
    act(() => {
      view = render(<HotkeysProvider>{content as ReactNode}</HotkeysProvider>);
    });
    return view;
  };

  const expectToastCopy = async (copy: string) => {
    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalled();
    });
    renderedToast();
    expect(screen.getByText(copy)).toBeInTheDocument();
  };

  it("seeds needsAction silently then toasts when a guest accepts", async () => {
    const event = hostOrganizedEvent([hostSelf(), guestBob()]);
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();
    expect(mocks.toast).not.toHaveBeenCalled();

    const updated = hostOrganizedEvent([hostSelf(), guestBob("accepted")]);
    updated.id = event.id;
    pushWeekEvents([updated]);
    await expectToastCopy("Bob accepted: Thu, Sep 24, 12:00 PM");
  });

  it("shows declined copy", async () => {
    const event = hostOrganizedEvent([hostSelf(), guestBob()]);
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();

    const updated = hostOrganizedEvent([hostSelf(), guestBob("declined")]);
    updated.id = event.id;
    pushWeekEvents([updated]);
    await expectToastCopy("Bob declined: Thu, Sep 24, 12:00 PM");
  });

  it("shows tentative copy", async () => {
    const event = hostOrganizedEvent([hostSelf(), guestBob()]);
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();

    const updated = hostOrganizedEvent([hostSelf(), guestBob("tentative")]);
    updated.id = event.id;
    pushWeekEvents([updated]);
    await expectToastCopy("Bob replied maybe: Thu, Sep 24, 12:00 PM");
  });

  it("uses plural copy for two guest replies in one refetch", async () => {
    const event = hostOrganizedEvent([hostSelf(), guestBob(), guestAnn()]);
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();

    const updated = hostOrganizedEvent([
      hostSelf(),
      guestBob("accepted"),
      guestAnn("declined"),
    ]);
    updated.id = event.id;
    pushWeekEvents([updated]);
    await expectToastCopy(
      "2 guests replied. Latest: Ann declined, Thu, Sep 24, 12:00 PM",
    );
  });

  it("ignores RSVP changes on events the host does not organize", async () => {
    const event = hostOrganizedEvent(
      [hostSelf(), guestBob()],
      "other@example.com",
    );
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();

    const updated = hostOrganizedEvent(
      [hostSelf(), guestBob("accepted")],
      "other@example.com",
    );
    updated.id = event.id;
    pushWeekEvents([updated]);
    await flushMicrotasks();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("ignores the host's own RSVP change", async () => {
    const event = hostOrganizedEvent([hostSelf("needsAction"), guestBob()]);
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();

    const updated = hostOrganizedEvent([hostSelf("accepted"), guestBob()]);
    updated.id = event.id;
    pushWeekEvents([updated]);
    await flushMicrotasks();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("does not toast when a guest moves to needsAction", async () => {
    const event = hostOrganizedEvent([hostSelf(), guestBob("accepted")]);
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();

    const updated = hostOrganizedEvent([hostSelf(), guestBob("needsAction")]);
    updated.id = event.id;
    pushWeekEvents([updated]);
    await flushMicrotasks();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("Show navigates to the event week", async () => {
    const event = hostOrganizedEvent([hostSelf(), guestBob()]);
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();

    const updated = hostOrganizedEvent([hostSelf(), guestBob("accepted")]);
    updated.id = event.id;
    pushWeekEvents([updated]);
    await expectToastCopy("Bob accepted: Thu, Sep 24, 12:00 PM");

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
    const event = hostOrganizedEvent([hostSelf(), guestBob()]);
    mountNotice();
    pushWeekEvents([event]);
    await flushMicrotasks();

    const updated = hostOrganizedEvent([hostSelf(), guestBob("accepted")]);
    updated.id = event.id;
    pushWeekEvents([updated]);
    await flushMicrotasks();
    expect(mocks.toast).not.toHaveBeenCalled();

    act(() => {
      setBillingGateOwnsScreen(false);
    });

    await expectToastCopy("Bob accepted: Thu, Sep 24, 12:00 PM");
  });
});
