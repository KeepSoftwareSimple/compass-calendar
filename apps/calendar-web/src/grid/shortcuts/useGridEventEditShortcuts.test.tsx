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
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import {
  edgeFocusActions,
  initialEdgeFocusState,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { useGridEventEditShortcuts } from "./useGridEventEditShortcuts";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

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

const mockCalendar = createMockCalendar();

const renderEditShortcuts = (
  overrides: Partial<Parameters<typeof useGridEventEditShortcuts>[0]> = {},
) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(calendarQueryKeys.all, [mockCalendar]);

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
        ...overrides,
      }),
    { wrapper },
  );
};

const mockTimedEvent = (overrides: Partial<GridEvent> = {}): GridEvent =>
  ({
    _id: "grid-event-1",
    calendarId: mockCalendar.id,
    endDate: "2026-05-20T10:00:00.000-05:00",
    isAllDay: false,
    startDate: "2026-05-20T09:00:00.000-05:00",
    ...overrides,
  }) as GridEvent;

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

describe("useGridEventEditShortcuts shortcut level recording", () => {
  const shortcutIds = (track: { mock: { calls: unknown[][] } }) =>
    track.mock.calls
      .filter(([name]) => name === "shortcut_invoked")
      .map(([, props]) => (props as { shortcut_id?: string }).shortcut_id);

  beforeEach(() => {
    HotkeyManager.resetInstance();
  });

  afterEach(() => {
    cleanup();
    clearAppLockReasons();
    useEdgeFocusStore.setState(initialEdgeFocusState, false, {
      type: "reset",
    });
    document.body.innerHTML = "";
  });

  it("records create-place-timed when Shift+Arrow places a draft with nothing focused", () => {
    const track = spyOn(Track, "track");
    const placeTimedDraft = mock();
    renderEditShortcuts({ placeTimedDraft, repositionDraftByKey: () => false });

    pressKey("ArrowUp", shiftKey);

    expect(placeTimedDraft).toHaveBeenCalledTimes(1);
    expect(shortcutIds(track)).toContain("create-place-timed");
    track.mockRestore();
  });

  it("records edit-move when a plain Arrow key repositions a focused draft", () => {
    const track = spyOn(Track, "track");
    renderEditShortcuts({ repositionDraftByKey: () => true });

    pressKey("ArrowUp");

    expect(shortcutIds(track)).toContain("edit-move");
    track.mockRestore();
  });

  it("records edit-move-edge when Shift+Arrow nudges a focused event's edge", () => {
    const track = spyOn(Track, "track");
    const event = mockTimedEvent();
    edgeFocusActions.setEdge(event._id!, "startDate", "Start 9:00 AM");

    renderEditShortcuts({
      targeting: {
        ...targeting,
        getFocused: () => ({ eventId: event._id!, eventType: "timed" }),
      },
      timedEvents: [event],
    });

    pressKey("ArrowUp", shiftKey);

    expect(shortcutIds(track)).toContain("edit-move-edge");
    track.mockRestore();
  });
});
