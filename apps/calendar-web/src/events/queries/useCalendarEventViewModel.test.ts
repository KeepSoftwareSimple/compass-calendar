import { renderHook } from "@testing-library/react";
import { type Calendar } from "@core/types/calendar.contracts";
import { type Event } from "@core/types/event.contracts";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { type NormalizedEventQueryData } from "./event.query.types";
import { useCalendarEventViewModel } from "./useCalendarEventViewModel";
import { describe, expect, it } from "bun:test";

const dataOf = (...events: Event[]): NormalizedEventQueryData => ({
  ids: events.map((event) => event.id),
  entities: Object.fromEntries(events.map((event) => [event.id, event])),
});

const setup = (calendars: Calendar[]) => {
  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);
  return wrapper;
};

describe("useCalendarEventViewModel", () => {
  it("hands every consumer of the same query data the same view model", () => {
    // The Week view model has many consumers. Each one rebuilding its own
    // filtered/merged copies would re-run the grid assembly per consumer and
    // hand each a distinct object, defeating the cards' memo comparators.
    const calendar = createMockCalendar();
    const wrapper = setup([calendar]);
    const data = dataOf(createMockEvent({ calendarId: calendar.id }));

    const { result, rerender } = renderHook(
      () => useCalendarEventViewModel(data),
      { wrapper },
    );
    const first = result.current;
    rerender();

    const { result: otherConsumer } = renderHook(
      () => useCalendarEventViewModel(data),
      { wrapper },
    );

    expect(result.current).toBe(first);
    expect(otherConsumer.current).toBe(first);
  });

  it("re-derives once the query data changes", () => {
    const calendar = createMockCalendar();
    const wrapper = setup([calendar]);
    const first = dataOf(createMockEvent({ calendarId: calendar.id }));
    const second = dataOf(createMockEvent({ calendarId: calendar.id }));

    const { result, rerender } = renderHook(
      ({ data }: { data: NormalizedEventQueryData }) =>
        useCalendarEventViewModel(data),
      { initialProps: { data: first }, wrapper },
    );
    const firstViewModel = result.current;

    rerender({ data: second });

    expect(result.current).not.toBe(firstViewModel);
    expect(result.current.events).toHaveLength(1);
  });

  it("keeps events while the calendars are still loading", () => {
    // No calendars yet is not "nothing is visible" - the grid must not flash
    // empty while they load, and that case gets its own memo slot.
    const data = dataOf(createMockEvent());
    const { queryClient, wrapper } = createStoreWrapper();
    queryClient.setQueryData(calendarQueryKeys.all, undefined);

    const { result, rerender } = renderHook(
      () => useCalendarEventViewModel(data),
      { wrapper },
    );
    const first = result.current;
    rerender();

    expect(result.current.events).toHaveLength(1);
    expect(result.current).toBe(first);
  });
});
