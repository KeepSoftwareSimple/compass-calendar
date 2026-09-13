import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { createFakeServerMessageBus } from "@web/__tests__/utils/sse-message-bus.test.util";
import { createCompassQueryClient } from "@web/api/query-client";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import * as realSseClient from "@web/sse/client/sse.client";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const bus = createFakeServerMessageBus();

mockModuleForFile("@web/sse/client/sse.client", realSseClient, {
  onServerMessage: bus.onServerMessage,
});

const { useEventSSE } =
  require("./useEventSSE") as typeof import("./useEventSSE");

// Short enough to wait out in a test, long enough that a synchronous burst
// lands entirely inside it.
const WINDOW_MS = 40;
const settle = () =>
  new Promise((resolve) => setTimeout(resolve, WINDOW_MS * 2));

const Host = () => {
  useEventSSE(WINDOW_MS);
  return null;
};

const eventsChanged = () =>
  bus.emit({
    type: "eventsChanged",
    calendarId: "000000000000000000000000",
    eventIds: [],
    reason: "reconciled",
  } as never);

const calendarsChanged = () =>
  bus.emit({ type: "calendarsChanged", calendarIds: [] } as never);

const renderHost = () => {
  const queryClient = createCompassQueryClient();
  const invalidateSpy = mock(queryClient.invalidateQueries.bind(queryClient));
  queryClient.invalidateQueries = invalidateSpy;
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Host />
    </QueryClientProvider>,
  );
  return { invalidateSpy, ...view };
};

const callsFor = (spy: ReturnType<typeof mock>, queryKey: unknown) =>
  spy.mock.calls.filter(
    ([filters]) =>
      JSON.stringify((filters as { queryKey?: unknown }).queryKey) ===
      JSON.stringify(queryKey),
  ).length;

describe("useEventSSE", () => {
  beforeEach(() => {
    bus.clear();
  });

  it("collapses a burst of eventsChanged messages into one immediate refetch and one trailing refetch", async () => {
    const { invalidateSpy } = renderHost();

    for (let i = 0; i < 25; i += 1) eventsChanged();

    // Leading edge: the first message refetches without waiting.
    expect(callsFor(invalidateSpy, eventQueryKeys.scope("day"))).toBe(1);
    expect(callsFor(invalidateSpy, eventQueryKeys.scope("week"))).toBe(1);

    await settle();

    // Trailing edge: the 24 messages inside the window owe exactly one more.
    expect(callsFor(invalidateSpy, eventQueryKeys.scope("day"))).toBe(2);
    expect(callsFor(invalidateSpy, eventQueryKeys.scope("week"))).toBe(2);

    await settle();
    // Nothing arrived during the trailing window, so it stays at two.
    expect(callsFor(invalidateSpy, eventQueryKeys.scope("day"))).toBe(2);
  });

  it("refetches a lone message immediately, so a single edit still updates live", () => {
    const { invalidateSpy } = renderHost();

    eventsChanged();

    expect(callsFor(invalidateSpy, eventQueryKeys.scope("day"))).toBe(1);
    expect(callsFor(invalidateSpy, eventQueryKeys.scope("week"))).toBe(1);
  });

  it("coalesces calendarsChanged separately from eventsChanged", async () => {
    const { invalidateSpy } = renderHost();

    for (let i = 0; i < 10; i += 1) calendarsChanged();
    eventsChanged();

    expect(callsFor(invalidateSpy, calendarQueryKeys.all)).toBe(1);
    expect(callsFor(invalidateSpy, eventQueryKeys.scope("day"))).toBe(1);

    await settle();

    expect(callsFor(invalidateSpy, calendarQueryKeys.all)).toBe(2);
    // The lone eventsChanged owed nothing further.
    expect(callsFor(invalidateSpy, eventQueryKeys.scope("day"))).toBe(1);
  });

  it("drops a pending trailing refetch on unmount", async () => {
    const { invalidateSpy, unmount } = renderHost();

    eventsChanged();
    eventsChanged();
    unmount();

    await settle();

    expect(callsFor(invalidateSpy, eventQueryKeys.scope("day"))).toBe(1);
  });
});
