import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@web/__tests__/__mocks__/mock.render";
import { toNormalizedEventQueryData } from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { ContextMenuWrapper } from "@web/components/ContextMenu/GridContextMenuWrapper";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { draftActions } from "@web/events/stores/draft.store";
import { WEEK_INTERACTION_EVENT_ID_ATTRIBUTE } from "@web/grid/interaction/view-event-registry";
import { resetContextMenuPointerHintForTests } from "@web/shortcuts/context-menu/context-menu-pointer-hint";
import { resetPointerHintPersistenceForTests } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  selectPointerHintAttempt,
  selectPointerHintPulse,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import {
  resetShortcutUsageProfileStoreForTests,
  writeShortcutUsageProfile,
} from "@web/shortcuts/tips/shortcut-personalization.storage";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";

const WRAPPER_ID = "test-grid-context-wrapper";

const event: Event = createMockEvent({
  content: { kind: "details", title: "Menu event", description: "" },
  schedule: EventScheduleSchema.parse({
    kind: "timed",
    start: "2024-01-15T09:00:00.000Z",
    end: "2024-01-15T10:00:00.000Z",
    timeZone: "UTC",
  }),
});

const seedCacheEntry = () => {
  const queryClient = createCompassQueryClient();
  queryClient.setQueryData(
    eventQueryKeys.week({
      source: "local",
      start: "2024-01-14T00:00:00.000Z",
      end: "2024-01-21T00:00:00.000Z",
    }),
    toNormalizedEventQueryData([event]),
  );
  return queryClient;
};

describe("GridContextMenuWrapper pointer hint", () => {
  const openContextMenu = (
    element: HTMLElement,
    clientX: number,
    clientY: number,
  ) => {
    act(() => {
      fireEvent.contextMenu(element, { clientX, clientY });
    });
  };

  beforeEach(() => {
    resetContextMenuPointerHintForTests();
    resetPointerHintPersistenceForTests();
    writeShortcutUsageProfile({ version: 2, actions: {}, shortcuts: {} });
    resetShortcutUsageProfileStoreForTests();
    usePointerHintStore.setState({
      pulse: 0,
      latestAttempt: null,
      isVisible: false,
    });
  });

  afterEach(() => {
    draftActions.discard();
    cleanup();
  });

  it("pulses the M hint once on a pointer right-click, not twice", () => {
    render(
      <ContextMenuWrapper id={WRAPPER_ID}>
        <div {...{ [WEEK_INTERACTION_EVENT_ID_ATTRIBUTE]: event.id }}>
          Menu event
        </div>
      </ContextMenuWrapper>,
      { queryClient: seedCacheEntry() },
    );

    const card = screen.getByText("Menu event");
    openContextMenu(card, 48, 48);
    expect(selectPointerHintPulse(usePointerHintStore.getState())).toBe(1);
    expect(selectPointerHintAttempt(usePointerHintStore.getState())).toEqual({
      shortcutKey: ["m"],
      source: "pointer",
    });

    openContextMenu(card, 52, 52);
    expect(selectPointerHintPulse(usePointerHintStore.getState())).toBe(1);
  });

  it("does not pulse when the menu opens from Shift+F10 coordinates", () => {
    render(
      <ContextMenuWrapper id={WRAPPER_ID}>
        <div {...{ [WEEK_INTERACTION_EVENT_ID_ATTRIBUTE]: event.id }}>
          Menu event
        </div>
      </ContextMenuWrapper>,
      { queryClient: seedCacheEntry() },
    );

    openContextMenu(screen.getByText("Menu event"), 0, 0);
    expect(selectPointerHintPulse(usePointerHintStore.getState())).toBe(0);
  });
});
