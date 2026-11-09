import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import {
  type BookingGuestRsvpClaimResponse,
  BookingGuestRsvpClaimResponseSchema,
} from "@core/types/booking.contracts";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { createFakeServerMessageBus } from "@web/__tests__/utils/sse-message-bus.test.util";
import * as realBookingApi from "@web/api/booking.api";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  resetBillingGateAttentionForTests,
  setBillingGateOwnsScreen,
} from "@web/billing/billing-gate-attention";
import {
  resetGuestRsvpNoticeForTests,
  useGuestRsvpNotice,
} from "@web/booking/useGuestRsvpNotice";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import * as realSseClient from "@web/sse/client/sse.client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";

const sseBus = createFakeServerMessageBus();

mockModuleForFile("@web/sse/client/sse.client", realSseClient, {
  onServerMessage: sseBus.onServerMessage,
});

const mockClaimGuestRsvpReplies = mock(
  async (): Promise<BookingGuestRsvpClaimResponse> => ({
    count: 0,
    latest: null,
    whileYouWereAway: false,
  }),
);

mockModuleForFile("@web/api/booking.api", realBookingApi, {
  BookingApi: {
    claimGuestRsvpReplies: (...args: unknown[]) =>
      args.length === 0
        ? mockClaimGuestRsvpReplies()
        : realBookingApi.BookingApi.claimGuestRsvpReplies(
            ...(args as Parameters<
              typeof realBookingApi.BookingApi.claimGuestRsvpReplies
            >),
          ),
  },
});

const oneReplyClaim = BookingGuestRsvpClaimResponseSchema.parse({
  count: 1,
  whileYouWereAway: false,
  latest: {
    id: "674b2c4e5f1a2b3c4d5e6f70",
    guestName: "Bob",
    status: "accepted",
    slotStart: "2026-09-24T17:00:00.000Z",
    firstObservedAt: "2026-09-09T12:00:00.000Z",
  },
});

const awayReplyClaim = BookingGuestRsvpClaimResponseSchema.parse({
  count: 1,
  whileYouWereAway: true,
  latest: {
    id: "674b2c4e5f1a2b3c4d5e6f71",
    guestName: "Jen",
    status: "accepted",
    slotStart: "2026-11-23T18:00:00.000Z",
    firstObservedAt: "2026-11-08T15:00:00.000Z",
  },
});

const authenticatedSession = {
  authenticated: true,
  setAuthenticated: () => {},
};

describe("useGuestRsvpNotice", () => {
  const { port, mocks } = createTestToastPort();
  let queryClient: QueryClient;

  beforeEach(() => {
    sseBus.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.toast.mockClear();
    registerToastPort(port);
    resetGuestRsvpNoticeForTests();
    mockClaimGuestRsvpReplies.mockReset();
    mockClaimGuestRsvpReplies.mockResolvedValue({
      count: 0,
      latest: null,
      whileYouWereAway: false,
    });
    setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
  });

  afterEach(() => {
    resetBillingGateAttentionForTests();
    resetGuestRsvpNoticeForTests();
    setSystemTime();
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <SessionContext.Provider value={authenticatedSession}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionContext.Provider>
  );

  it("claims on mount and shows toast copy with meeting time", async () => {
    mockClaimGuestRsvpReplies.mockResolvedValue(oneReplyClaim);
    renderHook(() => useGuestRsvpNotice(), { wrapper });
    await waitFor(() => {
      expect(mockClaimGuestRsvpReplies).toHaveBeenCalledTimes(1);
      expect(mocks.toast).toHaveBeenCalled();
    });
  });

  it("does not re-claim within the focus floor", async () => {
    mockClaimGuestRsvpReplies.mockResolvedValue(oneReplyClaim);
    const { rerender } = renderHook(() => useGuestRsvpNotice(), { wrapper });
    await waitFor(() => {
      expect(mockClaimGuestRsvpReplies).toHaveBeenCalledTimes(1);
    });
    rerender();
    await waitFor(() => {
      expect(mockClaimGuestRsvpReplies).toHaveBeenCalledTimes(1);
    });
  });

  it("defers the toast until the billing gate is released", async () => {
    setBillingGateOwnsScreen(true);
    mockClaimGuestRsvpReplies.mockResolvedValue(oneReplyClaim);
    renderHook(() => useGuestRsvpNotice(), { wrapper });
    await waitFor(() => {
      expect(mockClaimGuestRsvpReplies).toHaveBeenCalledTimes(1);
    });
    expect(mocks.toast).not.toHaveBeenCalled();
    setBillingGateOwnsScreen(false);
    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalled();
    });
  });

  it("passes while-you-were-away through to the toast", async () => {
    mockClaimGuestRsvpReplies.mockResolvedValue(awayReplyClaim);
    renderHook(() => useGuestRsvpNotice(), { wrapper });
    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalled();
    });
  });

  it("claims on eventsChanged and respects the SSE floor", async () => {
    renderHook(() => useGuestRsvpNotice(), { wrapper });
    await waitFor(() => {
      expect(mockClaimGuestRsvpReplies).toHaveBeenCalledTimes(1);
    });

    const eventsChanged = () =>
      sseBus.emit({
        type: "eventsChanged",
        calendarId: "000000000000000000000000",
        eventIds: [],
        reason: "updated",
      } as never);

    act(() => {
      eventsChanged();
    });
    await waitFor(() => {
      expect(mockClaimGuestRsvpReplies).toHaveBeenCalledTimes(2);
    });

    act(() => {
      eventsChanged();
    });
    expect(mockClaimGuestRsvpReplies).toHaveBeenCalledTimes(2);

    setSystemTime(new Date("2026-09-09T12:00:11.000Z"));
    act(() => {
      eventsChanged();
    });
    await waitFor(() => {
      expect(mockClaimGuestRsvpReplies).toHaveBeenCalledTimes(3);
    });
  });
});
