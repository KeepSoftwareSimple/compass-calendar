import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { seedPendingEventMutations } from "@web/__tests__/utils/event-query-test-data";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { type GoogleUiState } from "@web/auth/google/hooks/useConnectGoogle/useConnectGoogle.types";
import {
  initialFirstEventPromptState,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";
import { CALENDAR_VIEW_INTERACTION_ID_ATTRIBUTES } from "@web/grid/interaction/view-event-registry";
import {
  edgeFocusActions,
  initialEdgeFocusState,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { KEYBOARD_PLACE_HINT_PARTS } from "@web/grid/shortcuts/KeyboardPlaceIndicator";
import { settingsActions } from "@web/settings/settings.store";
import { quickTimeHintParts } from "@web/shortcuts/quick-time/QuickTimeIndicator";
import { EVENT_JUMP_IDLE_HINT_PARTS } from "@web/shortcuts/shift-hint/EventJumpIndicator";
import {
  eventJumpActions,
  initialEventJumpState,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import {
  getHintPlainText,
  getPartsPlainText,
  getShortcutHint,
} from "@web/shortcuts/tips/shortcut-tips.data";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import * as realUsessedegraded from "@web/sse/hooks/useSseDegraded";
import { TIME_TRAVEL_HINT_PARTS } from "@web/timezone/TimeTravelIndicator";
import {
  resetTimeTravelStoreForTests,
  setTimeTravelZone,
} from "@web/timezone/time-travel.store";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

// mock.module is process-wide and not reliably restorable, so - as in
// AccountSectionHeader.test.tsx - the real hook is captured up front and a
// flag (flipped in afterAll) decides which one runs.
const actualUseConnectProvider = (
  await import("@web/auth/providers/useConnectProvider")
).useConnectProvider;
let isConnectGoogleMocked = true;
let googleState: GoogleUiState = "HEALTHY";
let isConnecting = false;
let connection: GoogleSyncConnectionSummary | null = null;
mock.module("@web/auth/providers/useConnectProvider", () => ({
  useConnectProvider: (...args: Parameters<typeof actualUseConnectProvider>) =>
    isConnectGoogleMocked
      ? {
          commandAction: null,
          connect: mock(),
          connection,
          refresh: mock(),
          isAvailable: true,
          isConnecting,
          isRefreshing: false,
          state: googleState,
        }
      : actualUseConnectProvider(...args),
}));

// Do not mock.module google.sync.refresh here: process-wide mocks poison
// later/parallel suites (LifeView hung under CI). The real coordinator
// starts idle, which is what these cases need.

let isSseDegraded = false;
let isSseDegradedMocked = true;
const actualUseSseDegraded = (await import("@web/sse/hooks/useSseDegraded"))
  .useSseDegraded;
mockModuleForFile("@web/sse/hooks/useSseDegraded", realUsessedegraded, {
  useSseDegraded: () =>
    isSseDegradedMocked ? isSseDegraded : actualUseSseDegraded(),
});

afterAll(() => {
  isConnectGoogleMocked = false;
  isSseDegradedMocked = false;
});

const statusBarModuleUrl = new URL(
  `./SidebarStatusBar.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { SidebarStatusBar } = (await import(
  statusBarModuleUrl.href
)) as typeof import("./SidebarStatusBar");

const seedKeyboardPlaceDraft = () => {
  draftActions.startGridDraft({
    activity: "keyboardPlace",
    draft: createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    ),
  });
};

const KEYBOARD_PLACE_HINT = getPartsPlainText(KEYBOARD_PLACE_HINT_PARTS);
const TIME_TRAVEL_HINT = getPartsPlainText(TIME_TRAVEL_HINT_PARTS);
const EVENT_JUMP_IDLE_HINT = getPartsPlainText(EVENT_JUMP_IDLE_HINT_PARTS);
const QUICK_TIME_HINT = getPartsPlainText(quickTimeHintParts("11"));
const CREATE_EVENT_HINT = getHintPlainText(getShortcutHint("create-event"));
const FIRST_EVENT_SAVE_HINT = getHintPlainText(
  getShortcutHint("first-event-save"),
);
const PAGE_JUMP_HINT = getHintPlainText(getShortcutHint("page-jump"));
const EVENT_JUMP_HINT = getHintPlainText(getShortcutHint("event-jump"));
const EDIT_SEQUENCE_HINT = getHintPlainText(getShortcutHint("edit-sequence"));

const focusCalendarEvent = () => {
  const card = document.createElement("div");
  card.setAttribute(CALENDAR_VIEW_INTERACTION_ID_ATTRIBUTES[0], "evt-1");
  card.tabIndex = -1;
  document.body.appendChild(card);
  card.focus();
  return card;
};

describe("SidebarStatusBar", () => {
  beforeEach(() => {
    googleState = "HEALTHY";
    isConnecting = false;
    connection = null;
    isSseDegraded = false;
    draftActions.discard();
    useEventJumpStore.setState(initialEventJumpState, true);
    useEdgeFocusStore.setState(initialEdgeFocusState, true);
    useFirstEventPromptStore.setState(initialFirstEventPromptState, true);
    resetTimeTravelStoreForTests();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    draftActions.discard();
    useEventJumpStore.setState(initialEventJumpState, true);
    useEdgeFocusStore.setState(initialEdgeFocusState, true);
    useFirstEventPromptStore.setState(initialFirstEventPromptState, true);
    resetTimeTravelStoreForTests();
    document.body.innerHTML = "";
  });

  it("shows 'Saving changes…' when a mutation is pending", () => {
    const { queryClient, wrapper } = createStoreWrapper();
    seedPendingEventMutations(queryClient, ["event-1"]);

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByText("Saving changes…")).toBeInTheDocument();
  });

  it("reserves space for the status line when idle, showing the next shortcut", () => {
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(CREATE_EVENT_HINT);
  });

  it("wraps the shortcut instead of clipping it, so no hint ends in an ellipsis", () => {
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    const status = screen.getByRole("status");
    expect(status.className).not.toContain("truncate");
    expect(status.className).toContain("break-words");
    expect(status.className).toContain("text-center");
  });

  it("renders exactly one save status region, regardless of account count", () => {
    const { queryClient, wrapper } = createStoreWrapper();
    seedPendingEventMutations(queryClient, ["event-1"]);

    render(<SidebarStatusBar />, { wrapper });

    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(1);
    expect(screen.getByText("Saving changes…")).toBeInTheDocument();
  });

  it("shows the aggregate Google sync status while a brand-new account's first import runs, so the calendar list below never shifts", () => {
    googleState = "IMPORTING";
    connection = createMockConnection("ahab@pequod.com", {
      state: "importing",
      lastHealthyAt: null,
      connectionState: "IMPORTING",
    });
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Adding your calendar…",
    );
  });

  it("stays quiet while an already-established account runs routine catch-up, not just on first import", () => {
    googleState = "IMPORTING";
    connection = createMockConnection("ahab@pequod.com", {
      state: "catchingUp",
      lastSyncedAt: new Date().toISOString(),
      lastHealthyAt: new Date().toISOString(),
      connectionState: "IMPORTING",
    });
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.queryByText("Adding your calendar…")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(CREATE_EVENT_HINT);
  });

  it("shows Syncing in the background when catch-up is more than two minutes behind", () => {
    googleState = "IMPORTING";
    connection = createMockConnection("ahab@pequod.com", {
      state: "catchingUp",
      lastSyncedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      lastHealthyAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      connectionState: "IMPORTING",
    });
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Syncing in the background…",
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Syncing in the background…",
    );
  });

  it("shows Calendar updates are delayed for delayed workOverdue", () => {
    googleState = "ATTENTION";
    connection = createMockConnection("ahab@pequod.com", {
      state: "delayed",
      stateReason: "workOverdue",
      lastSyncedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      lastHealthyAt: null,
      connectionState: "ATTENTION",
    });
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Calendar updates are delayed",
    );
  });

  it("opens Settings when the status bar is activated", async () => {
    const user = userEvent.setup();
    const openSettings = spyOn(settingsActions, "openSettings");
    googleState = "ATTENTION";
    connection = createMockConnection("ahab@pequod.com", {
      state: "delayed",
      stateReason: "workOverdue",
      connectionState: "ATTENTION",
    });
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });
    const settingsButton = screen.getByRole("button", {
      name: "Calendar updates are delayed. Open account settings",
    });
    expect(settingsButton).toHaveAttribute(
      "data-pointer-shortcut",
      '["Mod",","]',
    );
    await user.click(settingsButton);

    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  it("prefers 'Saving changes…' over the Google sync status when both are true", () => {
    googleState = "IMPORTING";
    connection = createMockConnection("ahab@pequod.com", {
      state: "importing",
      lastHealthyAt: null,
      connectionState: "IMPORTING",
    });
    const { queryClient, wrapper } = createStoreWrapper();
    seedPendingEventMutations(queryClient, ["event-1"]);

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent("Saving changes…");
    expect(screen.queryByText("Adding your calendar…")).toBeNull();
  });

  it("shows the next shortcut when the aggregate Google state is healthy", () => {
    googleState = "HEALTHY";
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(CREATE_EVENT_HINT);
  });

  it("shows a live-updates warning when SSE is degraded and sync is otherwise silent", () => {
    googleState = "HEALTHY";
    isSseDegraded = true;
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Reconnecting live updates…",
    );
  });

  it("does not let the live-updates warning preempt a real sync problem", () => {
    googleState = "ATTENTION";
    isSseDegraded = true;
    connection = createMockConnection("ahab@pequod.com", {
      state: "delayed",
      stateReason: "workOverdue",
      connectionState: "ATTENTION",
    });
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Calendar updates are delayed",
    );
    expect(screen.queryByText("Reconnecting live updates…")).toBeNull();
  });

  it("prefers 'Saving changes…' over the live-updates warning when both are true", () => {
    isSseDegraded = true;
    const { queryClient, wrapper } = createStoreWrapper();
    seedPendingEventMutations(queryClient, ["event-1"]);

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent("Saving changes…");
  });

  it("shows Enter to open and Esc to discard while a form-closed keyboardPlace draft exists", () => {
    seedKeyboardPlaceDraft();
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(KEYBOARD_PLACE_HINT);
  });

  it("hides the keyboardPlace hint once the form is open", () => {
    seedKeyboardPlaceDraft();
    draftActions.setFormOpen(true);
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.queryByText(KEYBOARD_PLACE_HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(FIRST_EVENT_SAVE_HINT);
  });

  it("shows hold-Mod after the first event is done and the calendar is idle", () => {
    useFirstEventPromptStore.setState({ isDone: true }, false);
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(PAGE_JUMP_HINT);
  });

  it("advances to the event-jump tip once hold-Mod has been demonstrated", () => {
    useFirstEventPromptStore.setState({ isDone: true }, false);
    shortcutHintProgressActions.demonstrate("page-jump");
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(EVENT_JUMP_HINT);
  });

  it("shows edit-sequence when a calendar event is focused", () => {
    focusCalendarEvent();
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(EDIT_SEQUENCE_HINT);
  });

  it("yields the next-shortcut hint to event jump", () => {
    eventJumpActions.setActive(true);
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(EVENT_JUMP_IDLE_HINT);
    expect(screen.queryByText(CREATE_EVENT_HINT)).not.toBeInTheDocument();
  });

  it("gives a half-typed time priority over event jump", () => {
    eventJumpActions.setActive(true);
    eventJumpActions.setQuickTimeDigits("11");
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(QUICK_TIME_HINT);
    expect(screen.queryByText(EVENT_JUMP_IDLE_HINT)).not.toBeInTheDocument();
  });

  it("yields the keyboardPlace hint to event jump", () => {
    seedKeyboardPlaceDraft();
    eventJumpActions.setActive(true);
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(EVENT_JUMP_IDLE_HINT);
    expect(screen.queryByText(KEYBOARD_PLACE_HINT)).not.toBeInTheDocument();
  });

  it("yields the keyboardPlace hint to edge focus", () => {
    seedKeyboardPlaceDraft();
    edgeFocusActions.setEdge(
      "aaaaaaaaaaaaaaaaaaaaaaaa",
      "startDate",
      "Editing start time",
    );
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent("Editing start time");
    expect(screen.queryByText(KEYBOARD_PLACE_HINT)).not.toBeInTheDocument();
  });

  it("replaces the idle shortcut tip with the time travel hint", () => {
    setTimeTravelZone("America/Denver");
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(TIME_TRAVEL_HINT);
    expect(screen.queryByText(CREATE_EVENT_HINT)).not.toBeInTheDocument();
  });

  it("yields the time travel hint to keyboardPlace", () => {
    setTimeTravelZone("America/Denver");
    seedKeyboardPlaceDraft();
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(KEYBOARD_PLACE_HINT);
    expect(screen.queryByText(TIME_TRAVEL_HINT)).not.toBeInTheDocument();
  });

  it("yields the time travel hint to event jump", () => {
    setTimeTravelZone("America/Denver");
    eventJumpActions.setActive(true);
    const { wrapper } = createStoreWrapper();

    render(<SidebarStatusBar />, { wrapper });

    expect(screen.getByRole("status")).toHaveTextContent(EVENT_JUMP_IDLE_HINT);
    expect(screen.queryByText(TIME_TRAVEL_HINT)).not.toBeInTheDocument();
  });
});
