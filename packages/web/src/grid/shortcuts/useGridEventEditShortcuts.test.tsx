import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import dayjs from "@core/util/date/dayjs";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import * as Track from "@web/auth/posthog/track";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { useGridEventEditShortcuts } from "./useGridEventEditShortcuts";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

const shiftKey = {
  keyDownInit: { shiftKey: true },
  keyUpInit: { shiftKey: true },
};

const targeting = {
  focus: () => {},
  getFocused: () => null,
  getFocusedNavigable: () => null,
  listNavigable: () => [],
};

const renderEditShortcuts = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(calendarQueryKeys.all, [createMockCalendar()]);

  function wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <HotkeysProvider>{children}</HotkeysProvider>
      </QueryClientProvider>
    );
  }

  return renderHook(
    () =>
      useGridEventEditShortcuts({
        dayBoundary: {
          kind: "clamp",
          weekDays: [dayjs("2026-05-20")],
        },
        repositionDraftByKey: () => false,
        targeting,
        timedEvents: [],
      }),
    { wrapper },
  );
};

describe("useGridEventEditShortcuts overlay Tab", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    HotkeyManager.resetInstance();
    mocks.toast.mockClear();
    registerToastPort(port);
  });

  afterEach(() => {
    cleanup();
    clearAppLockReasons();
    resetToastPort();
    document.body.innerHTML = "";
  });

  it("moves focus natively inside authModal: no toast and no unavailable attempt", () => {
    const track = spyOn(Track, "track");
    setAppLockReason("authModal", true);
    renderEditShortcuts();

    pressKey("Tab");
    pressKey("Tab", shiftKey);

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(
      track.mock.calls.filter(
        ([name]) => name === "shortcut_unavailable_attempt",
      ),
    ).toHaveLength(0);
    track.mockRestore();
  });
});
