import { act } from "react";
import dayjs from "@core/util/date/dayjs";
import { renderHook } from "@web/__tests__/__mocks__/mock.render";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const DATE_FORMAT = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

const mockNavigate = mock();
const mockParams: { dateString?: string } = {};

// @tanstack/react-router's useNavigate/useParams are mocked directly (rather
// than relying on a real RouterProvider) because Bun's `mock.module` is
// process-wide: another test file mocking "@tanstack/react-router" can
// otherwise silently replace these hooks for every file that runs afterward
// in the same test run. See useGlobalShortcuts.test.tsx for the same pattern.
//
// Snapshotted into a plain object (not just the namespace reference) because
// mock.module mutates the live module object in place - without the copy,
// `actualTanstackRouter.useNavigate` below would end up pointing at the mock
// itself once registered. And rather than trying to "restore" the module
// afterward (races with other files' top-level dynamic imports), the factory
// checks a flag on every call, flipped off in afterAll below.
const actualTanstackRouter = { ...(await import("@tanstack/react-router")) };
let isRouterMocked = true;

mock.module("@tanstack/react-router", () => ({
  ...actualTanstackRouter,
  useNavigate: (...args: unknown[]) =>
    isRouterMocked
      ? mockNavigate
      : (actualTanstackRouter.useNavigate as (...a: unknown[]) => unknown)(
          ...args,
        ),
  useParams: (...args: unknown[]) =>
    isRouterMocked
      ? mockParams
      : (actualTanstackRouter.useParams as (...a: unknown[]) => unknown)(
          ...args,
        ),
}));

afterAll(() => {
  isRouterMocked = false;
});

const { useWeek } = await import("./useWeek");

describe("useWeek", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockParams.dateString = undefined;
  });

  it("derives the anchor and week days from the URL date, not today", () => {
    mockParams.dateString = "2026-05-20";
    const today = dayjs("2026-07-07", DATE_FORMAT);

    const { result } = renderHook(() => useWeek(today));

    expect(result.current.component.startOfView.format(DATE_FORMAT)).toBe(
      "2026-05-20",
    );
    expect(result.current.component.isCurrentWeek).toBe(false);
    expect(
      result.current.component.weekDays.map((d) => d.format(DATE_FORMAT)),
    ).not.toContain(today.format(DATE_FORMAT));
  });

  it("defaults the anchor to the week start on multi-day widths when no dateString", () => {
    const today = dayjs("2026-07-07", DATE_FORMAT); // Tuesday

    const { result } = renderHook(() => useWeek(today));

    expect(result.current.component.startOfView.format(DATE_FORMAT)).toBe(
      "2026-07-05", // Sunday, start of the week containing today
    );
    expect(result.current.component.isCurrentWeek).toBe(true);
  });

  it("defaults the anchor to today at single-day (phone) width when no dateString", () => {
    const today = dayjs("2026-07-07", DATE_FORMAT); // Tuesday

    const { result } = renderHook(() => useWeek(today, 1));

    expect(result.current.component.startOfView.format(DATE_FORMAT)).toBe(
      "2026-07-07",
    );
    expect(
      result.current.component.weekDays.map((d) => d.format(DATE_FORMAT)),
    ).toEqual(["2026-07-07"]);
  });

  it("navigates to the incremented week on incrementWeek", () => {
    mockParams.dateString = "2026-05-20";
    const today = dayjs("2026-05-20", DATE_FORMAT);
    const { result } = renderHook(() => useWeek(today));

    act(() => {
      result.current.util.incrementWeek();
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/week/$dateString",
      params: { dateString: "2026-05-27" },
    });
  });

  it("navigates to the decremented week on decrementWeek", () => {
    mockParams.dateString = "2026-05-20";
    const today = dayjs("2026-05-20", DATE_FORMAT);
    const { result } = renderHook(() => useWeek(today));

    act(() => {
      result.current.util.decrementWeek();
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/week/$dateString",
      params: { dateString: "2026-05-13" },
    });
  });

  it("shifts the visible range forward by one day", () => {
    mockParams.dateString = "2026-05-20";
    const { result } = renderHook(() =>
      useWeek(dayjs("2026-05-20", DATE_FORMAT)),
    );

    act(() => result.current.util.shiftViewByDay(1));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/week/$dateString",
      params: { dateString: "2026-05-21" },
    });
    expect(result.current.util.getLastNavigationSource()).toBe("day-shift");
  });

  it("shifts the visible range backward by one day", () => {
    mockParams.dateString = "2026-05-20";
    const { result } = renderHook(() =>
      useWeek(dayjs("2026-05-20", DATE_FORMAT)),
    );

    act(() => result.current.util.shiftViewByDay(-1));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/week/$dateString",
      params: { dateString: "2026-05-19" },
    });
  });

  it("navigates to the given date on goToDate", () => {
    mockParams.dateString = "2026-05-20";
    const today = dayjs("2026-05-20", DATE_FORMAT);
    const { result } = renderHook(() => useWeek(today));

    act(() => {
      result.current.state.goToDate(dayjs("2026-08-01", DATE_FORMAT));
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/week/$dateString",
      params: { dateString: "2026-08-01" },
    });
  });

  it("navigates to today on goToToday", () => {
    mockParams.dateString = "2026-01-01";
    const today = dayjs("2026-05-20", DATE_FORMAT);
    const { result } = renderHook(() => useWeek(today));

    act(() => {
      result.current.util.goToToday();
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/week/$dateString",
      params: { dateString: "2026-05-17" },
    });
  });

  it("preserves a shifted window when returning to today", () => {
    mockParams.dateString = "2026-01-01";
    const today = dayjs("2026-05-20", DATE_FORMAT);
    const { rerender, result } = renderHook(() => useWeek(today));

    act(() => result.current.util.shiftViewByDay(1));
    mockParams.dateString = "2026-01-02";
    rerender();
    mockNavigate.mockClear();

    act(() => result.current.util.goToToday());

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/week/$dateString",
      params: { dateString: "2026-05-22" },
    });
  });

  it("does not navigate on goToToday when already viewing today's week", () => {
    mockParams.dateString = "2026-05-20";
    const today = dayjs("2026-05-20", DATE_FORMAT);
    const { result } = renderHook(() => useWeek(today));

    act(() => {
      result.current.util.goToToday();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("pages by the number of visible days", () => {
    mockParams.dateString = "2026-05-20";
    const today = dayjs("2026-05-20", DATE_FORMAT);
    const { result } = renderHook(() => useWeek(today, 3));

    act(() => {
      result.current.util.incrementWeek();
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/week/$dateString",
      params: { dateString: "2026-05-23" },
    });
  });

  it("keeps the query fetch window stable when visible day count changes", () => {
    mockParams.dateString = "2026-05-20";
    const today = dayjs("2026-05-20", DATE_FORMAT);
    const { result, rerender } = renderHook(
      ({ visibleDayCount }: { visibleDayCount: number }) =>
        useWeek(today, visibleDayCount),
      { initialProps: { visibleDayCount: 7 } },
    );

    const queryEndAtSeven = result.current.query.endOfView.format(DATE_FORMAT);

    rerender({ visibleDayCount: 3 });

    expect(result.current.query.endOfView.format(DATE_FORMAT)).toBe(
      queryEndAtSeven,
    );
    expect(result.current.component.endOfView.format(DATE_FORMAT)).not.toBe(
      queryEndAtSeven,
    );
  });

  it("uses exclusive next local midnight as the fetch window end", () => {
    mockParams.dateString = "2026-08-06";
    const today = dayjs("2026-08-07", DATE_FORMAT);
    const { result } = renderHook(() => useWeek(today));

    expect(result.current.query.startOfView.format(DATE_FORMAT)).toBe(
      "2026-08-06",
    );
    // WEEK_DAY_COUNT days from the anchor → exclusive end is the following
    // midnight in the effective calendar timezone.
    expect(result.current.query.endOfView.format()).toBe(
      dayjs.tz("2026-08-13", getEffectiveTimeZone()).startOf("day").format(),
    );
  });
});
