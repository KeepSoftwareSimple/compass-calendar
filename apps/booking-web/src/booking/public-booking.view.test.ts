import { PublicBookingNotFoundError } from "@booking-web/api/public-booking.api";
import {
  PUBLIC_BOOKING_LOAD_FAILED,
  PUBLIC_BOOKING_UNBOOKABLE,
  publicBookingMeetingNotFound,
  resolvePublicBookingPageView,
} from "@booking-web/booking/public-booking.view";
import { type UseQueryResult } from "@tanstack/react-query";
import {
  type BookingSlotsResponse,
  type PublicGetBookingPageResponse,
} from "@core/types/booking.contracts";
import { describe, expect, it } from "bun:test";

const NOT_FOUND = publicBookingMeetingNotFound("This link may be incorrect.");

const enabledPage = {
  enabled: true,
  durationMinutes: 30,
} as unknown as PublicGetBookingPageResponse;

const disabledPage = {
  enabled: false,
} as unknown as PublicGetBookingPageResponse;

type PageQuery = UseQueryResult<PublicGetBookingPageResponse>;

const pageQuery = (state: Partial<PageQuery>): PageQuery =>
  ({
    isLoading: false,
    isSuccess: false,
    error: null,
    data: undefined,
    ...state,
  }) as PageQuery;

const slots = (bookable: boolean): BookingSlotsResponse =>
  ({ slots: [], bookable }) as BookingSlotsResponse;

describe("resolvePublicBookingPageView", () => {
  it("shows the loading copy while the page query is in flight", () => {
    const view = resolvePublicBookingPageView(
      pageQuery({ isLoading: true }),
      undefined,
      NOT_FOUND,
    );

    expect(view).toEqual({
      kind: "status",
      title: "Loading meeting page",
      description: "One moment while we load available times.",
    });
  });

  it("treats a 404 as the caller's not-found copy", () => {
    const view = resolvePublicBookingPageView(
      pageQuery({ error: new PublicBookingNotFoundError() }),
      undefined,
      NOT_FOUND,
    );

    expect(view).toEqual({ kind: "status", ...NOT_FOUND });
  });

  it("reports a load failure for any other error", () => {
    const view = resolvePublicBookingPageView(
      pageQuery({ error: new Error("boom") }),
      undefined,
      NOT_FOUND,
    );

    expect(view).toEqual({ kind: "status", ...PUBLIC_BOOKING_LOAD_FAILED });
  });

  it("hides a disabled page behind the same not-found copy as a bad link", () => {
    const view = resolvePublicBookingPageView(
      pageQuery({ isSuccess: true, data: disabledPage }),
      undefined,
      NOT_FOUND,
    );

    expect(view).toEqual({ kind: "status", ...NOT_FOUND });
  });

  it("ends the flow when the host calendar cannot take bookings", () => {
    const view = resolvePublicBookingPageView(
      pageQuery({ isSuccess: true, data: enabledPage }),
      slots(false),
      NOT_FOUND,
    );

    expect(view).toEqual({ kind: "status", ...PUBLIC_BOOKING_UNBOOKABLE });
  });

  it("returns the page once it is enabled and bookable", () => {
    const view = resolvePublicBookingPageView(
      pageQuery({ isSuccess: true, data: enabledPage }),
      slots(true),
      NOT_FOUND,
    );

    expect(view).toEqual({ kind: "page", page: enabledPage });
  });

  it("returns the page before any slots have loaded", () => {
    const view = resolvePublicBookingPageView(
      pageQuery({ isSuccess: true, data: enabledPage }),
      undefined,
      NOT_FOUND,
    );

    expect(view).toEqual({ kind: "page", page: enabledPage });
  });
});
