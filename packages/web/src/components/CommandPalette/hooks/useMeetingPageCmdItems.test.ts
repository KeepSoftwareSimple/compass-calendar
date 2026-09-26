import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { CalendarPlusIcon } from "@phosphor-icons/react/dist/csr/CalendarPlus";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { DEFAULT_WEEKLY_AVAILABILITY } from "@core/types/booking.contracts";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUseSession from "@web/auth/compass/session/useSession";
import * as realBookingQuery from "@web/booking/booking.query";
import {
  selectIsSettingsOpen,
  selectOverlayOpenedFromPalette,
  selectSettingsPage,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockUseSession = mock();
const mockUseBookingPageQuery = mock();

mockModuleForFile("@web/auth/compass/session/useSession", realUseSession, {
  useSession: mockUseSession,
});

mockModuleForFile("@web/booking/booking.query", realBookingQuery, {
  useBookingPageQuery: mockUseBookingPageQuery,
});

const { useMeetingPageCmdItems } = await import("./useMeetingPageCmdItems");

const savedPage = {
  id: "000000000000000000000001",
  slug: "hostuser",
  hostUserId: "000000000000000000000002",
  enabled: false,
  durationMinutes: 30,
  destinationCalendarId: "000000000000000000000001",
  blockingCalendarIds: ["000000000000000000000001"],
  timeZone: "UTC",
  weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
  minNoticeHours: 4,
  maxHorizonDays: 60,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  bookingUrl: "https://compasscalendar.com/meet/hostuser",
};

describe("useMeetingPageCmdItems", () => {
  const originalWindowOpen = window.open;

  beforeEach(() => {
    useSettingsStore.setState({
      isSettingsOpen: false,
      settingsPage: "accounts",
      overlayOpenedFromPalette: false,
    });
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated: mock(),
    });
    mockUseBookingPageQuery.mockReset();
    window.open = mock() as typeof window.open;
  });

  afterEach(() => {
    window.open = originalWindowOpen;
  });

  it("returns no items when logged out", () => {
    mockUseSession.mockReturnValue({
      authenticated: false,
      setAuthenticated: mock(),
    });
    mockUseBookingPageQuery.mockReturnValue({
      data: savedPage,
      isSuccess: true,
    });

    const { result } = renderHook(() => useMeetingPageCmdItems());

    expect(result.current).toEqual([]);
  });

  it("returns no items while the booking page is loading", () => {
    mockUseBookingPageQuery.mockReturnValue({
      data: undefined,
      isSuccess: false,
    });

    const { result } = renderHook(() => useMeetingPageCmdItems());

    expect(result.current).toEqual([]);
  });

  it("opens the public meeting page when the page is live", () => {
    mockUseBookingPageQuery.mockReturnValue({
      data: { ...savedPage, enabled: true },
      isSuccess: true,
    });

    const { result } = renderHook(() => useMeetingPageCmdItems());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("Open meeting page");
    expect(result.current[0].icon).toBe(ArrowSquareOut);

    act(() => {
      result.current[0].onClick?.();
    });

    expect(window.open).toHaveBeenCalledWith(
      savedPage.bookingUrl,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens Meeting settings for setup when the page is not live", () => {
    mockUseBookingPageQuery.mockReturnValue({
      data: savedPage,
      isSuccess: true,
    });

    const { result } = renderHook(() => useMeetingPageCmdItems());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBe("Set up meeting page");
    expect(result.current[0].icon).toBe(CalendarPlusIcon);

    act(() => {
      result.current[0].onClick?.();
    });

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("booking");
    expect(selectOverlayOpenedFromPalette(useSettingsStore.getState())).toBe(
      true,
    );
  });
});
