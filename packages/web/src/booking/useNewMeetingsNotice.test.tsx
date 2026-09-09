import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type PropsWithChildren, type ReactNode } from "react";
import {
  type BookingNewMeetingsClaimResponse,
  BookingNewMeetingsClaimResponseSchema,
} from "@core/types/booking.contracts";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realBookingApi from "@web/api/booking.api";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  resetBillingGateAttentionForTests,
  setBillingGateOwnsScreen,
} from "@web/billing/billing-gate-attention";
import { billingPreviewActions } from "@web/billing/billing-preview.store";
import { useNewMeetingsNotice } from "@web/booking/useNewMeetingsNotice";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import * as realRouters from "@web/routers";
import {
  resetEffectiveTimeZoneStoreForTests,
  setEffectiveTimeZoneForTests,
} from "@web/timezone/effective-timezone.store";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";

const mockClaimNewMeetings = mock(
  async (): Promise<BookingNewMeetingsClaimResponse> => ({
    reservations: [],
  }),
);
const mockNavigate = mock();

let isBookingApiMocked = true;
afterAll(() => {
  isBookingApiMocked = false;
});

mock.module("@web/api/booking.api", () => ({
  BookingApi: {
    getPage: (...args: unknown[]) =>
      realBookingApi.BookingApi.getPage(
        ...(args as Parameters<typeof realBookingApi.BookingApi.getPage>),
      ),
    putPage: (...args: unknown[]) =>
      realBookingApi.BookingApi.putPage(
        ...(args as Parameters<typeof realBookingApi.BookingApi.putPage>),
      ),
    claimNewMeetings: (...args: unknown[]) =>
      isBookingApiMocked
        ? mockClaimNewMeetings(
            ...(args as Parameters<typeof mockClaimNewMeetings>),
          )
        : realBookingApi.BookingApi.claimNewMeetings(
            ...(args as Parameters<
              typeof realBookingApi.BookingApi.claimNewMeetings
            >),
          ),
  },
}));

mockModuleForFile("@web/routers", realRouters, {
  router: { navigate: mockNavigate },
});

const authenticatedSession = {
  authenticated: true,
  setAuthenticated: () => {},
};

const anonymousSession = {
  authenticated: false,
  setAuthenticated: () => {},
};

const chicagoSlot = "2026-09-24T17:00:00.000Z";

const oneReservation = BookingNewMeetingsClaimResponseSchema.parse({
  reservations: [
    {
      id: "0000000000000000000000aa",
      guestName: "Bob",
      slotStart: chicagoSlot,
      slotEnd: "2026-09-24T17:30:00.000Z",
    },
  ],
}).reservations;

const threeReservations = BookingNewMeetingsClaimResponseSchema.parse({
  reservations: [
    {
      id: "0000000000000000000000a1",
      guestName: "Ada",
      slotStart: "2026-09-23T17:00:00.000Z",
      slotEnd: "2026-09-23T17:30:00.000Z",
    },
    {
      id: "0000000000000000000000a2",
      guestName: "Lin",
      slotStart: "2026-09-24T15:00:00.000Z",
      slotEnd: "2026-09-24T15:30:00.000Z",
    },
    {
      id: "0000000000000000000000a3",
      guestName: "Bob",
      slotStart: chicagoSlot,
      slotEnd: "2026-09-24T17:30:00.000Z",
    },
  ],
}).reservations;

function Authenticated({ children }: PropsWithChildren) {
  return (
    <SessionContext.Provider value={authenticatedSession}>
      {children}
    </SessionContext.Provider>
  );
}

describe("useNewMeetingsNotice", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.toast.mockClear();
    mocks.dismiss.mockClear();
    mockClaimNewMeetings.mockReset();
    mockClaimNewMeetings.mockResolvedValue({ reservations: [] });
    mockNavigate.mockClear();
    registerToastPort(port);
    setEffectiveTimeZoneForTests("America/Chicago");
    setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    resetBillingGateAttentionForTests();
    resetEffectiveTimeZoneStoreForTests();
    setSystemTime();
  });

  const renderNotice = (wrapper = Authenticated) =>
    renderHook(() => useNewMeetingsNotice(), { wrapper });

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

  it("shows the single-booking sentence and Show navigates to that week", async () => {
    mockClaimNewMeetings.mockResolvedValue({ reservations: oneReservation });
    renderNotice();

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalled();
    });
    renderedToast();

    expect(
      screen.getByText("Bob booked a meeting: Thu, Sep 24, 12:00 PM"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/week/$dateString",
        params: { dateString: "2026-09-24" },
      });
    });
  });

  it("shows the count sentence for several bookings", async () => {
    mockClaimNewMeetings.mockResolvedValue({
      reservations: threeReservations,
    });
    renderNotice();

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalled();
    });
    renderedToast();

    expect(
      screen.getByText(
        "3 meetings booked since you last looked. Latest: Bob, Thu, Sep 24, 12:00 PM",
      ),
    ).toBeInTheDocument();
  });

  it("shows nothing when the claim is empty", async () => {
    renderNotice();

    await waitFor(() => {
      expect(mockClaimNewMeetings).toHaveBeenCalledTimes(1);
    });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("does not claim for an anonymous session", async () => {
    renderHook(() => useNewMeetingsNotice(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <SessionContext.Provider value={anonymousSession}>
          {children}
        </SessionContext.Provider>
      ),
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockClaimNewMeetings).not.toHaveBeenCalled();
  });

  it("defers the toast until the billing gate is released", async () => {
    setBillingGateOwnsScreen(true);
    mockClaimNewMeetings.mockResolvedValue({ reservations: oneReservation });
    renderNotice();

    await waitFor(() => {
      expect(mockClaimNewMeetings).toHaveBeenCalledTimes(1);
    });
    expect(mocks.toast).not.toHaveBeenCalled();

    act(() => {
      billingPreviewActions.enter();
    });

    expect(mocks.toast).toHaveBeenCalled();
    renderedToast();
    expect(
      screen.getByText("Bob booked a meeting: Thu, Sep 24, 12:00 PM"),
    ).toBeInTheDocument();
  });

  it("does not claim again on a visibility change within five minutes", async () => {
    renderNotice();
    await waitFor(() => {
      expect(mockClaimNewMeetings).toHaveBeenCalledTimes(1);
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(mockClaimNewMeetings).toHaveBeenCalledTimes(1);

    setSystemTime(new Date("2026-09-09T12:06:00.000Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(mockClaimNewMeetings).toHaveBeenCalledTimes(2);
    });
  });
});
