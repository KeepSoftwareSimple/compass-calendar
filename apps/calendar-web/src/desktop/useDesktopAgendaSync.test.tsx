import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import dayjs from "@core/util/date/dayjs";
import { afterEach, describe, expect, it, mock } from "bun:test";
import "@web/desktop/compass-desktop.global";
import { DESKTOP_AGENDA_DEBOUNCE_MS } from "@web/desktop/desktop-agenda.logic";
import { useDesktopAgendaSync } from "@web/desktop/useDesktopAgendaSync";

mock.module("@web/components/Sidebar/UpNextCard/useUpNextEvent", () => ({
  useTodayTimedEvents: () => ({
    now: dayjs("2026-10-01T12:00:00.000Z"),
    allTimedEvents: [
      {
        _id: "evt-1",
        title: "Standup",
        startDate: "2026-10-01T14:00:00.000Z",
        endDate: "2026-10-01T14:30:00.000Z",
      },
    ],
  }),
}));

describe("useDesktopAgendaSync", () => {
  afterEach(() => {
    delete window.compassDesktop;
  });

  it("debounces setAgenda on mount", async () => {
    const setAgenda = mock(() => {});
    window.compassDesktop = {
      version: "0.1.0",
      platform: "macos",
      openExternal: () => {},
      setAgenda,
      restartToUpdate: () => {},
      onDeepLink: () => () => {},
      onUpdateReady: () => () => {},
    };

    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useDesktopAgendaSync(), { wrapper });

    expect(setAgenda).not.toHaveBeenCalled();

    await new Promise((resolve) =>
      setTimeout(resolve, DESKTOP_AGENDA_DEBOUNCE_MS + 50),
    );

    expect(setAgenda).toHaveBeenCalledTimes(1);
    expect(setAgenda).toHaveBeenCalledWith([
      {
        id: "evt-1",
        title: "Standup",
        startsAt: "2026-10-01T14:00:00.000Z",
        endsAt: "2026-10-01T14:30:00.000Z",
      },
    ]);
  });
});
