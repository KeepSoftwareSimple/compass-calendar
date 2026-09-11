import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { type Event } from "@core/types/event.contracts";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import {
  isGridEventInteractionReadOnly,
  isGridEventScheduleLocked,
  useCalendarLookup,
} from "@web/calendars/useCalendarLookup";
import { useDefaultTargetCalendar } from "@web/calendars/useDefaultTargetCalendar";
import {
  ID_GRID_MAIN,
  ID_SIDEBAR,
  ID_WEEK_GRID_SCROLLER,
} from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { getVisibleGridStartMinute } from "@web/common/utils/draft/draft.util";
import {
  getCalendarEventIdFromElement,
  refocusEventElement,
} from "@web/common/utils/event/event.util";
import {
  convertAllDayToTimedDates,
  type EventEdge,
  getArrowKeyMovement,
} from "@web/common/utils/event/event-nudge.util";
import {
  nudgeEventEdgeFromKeyboard,
  nudgeEventFromKeyboard,
} from "@web/common/utils/event/event-nudge-shortcut.util";
import {
  isDeleteTextEditingTarget,
  isEditableKeyboardTarget,
  isEventFormKeyboardTarget,
} from "@web/common/utils/form/form.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  duplicateGridEventDraft,
  getGridDraftId,
  gridEventDraftToGridEvent,
  replaceGridDraftSchedule,
} from "@web/events/grid-event-draft.adapter";
import { commitDuplicateEvent } from "@web/events/mutations/duplicate-event";
import {
  type EventMutationDependencies,
  useEventMutations,
} from "@web/events/mutations/useEventMutations";
import { useUpdateEvent } from "@web/events/mutations/useUpdateEvent";
import { findEventInCache } from "@web/events/queries/event.query.cache";
import {
  draftActions,
  isEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  eventClipboardActions,
  useEventClipboardStore,
} from "@web/events/stores/event-clipboard.store";
import {
  edgeFocusActions,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import {
  type FocusableGridEventTarget,
  findCalendarEventForTarget,
  type GridEventShortcutTarget,
  getChronologicallyAdjacentTarget,
  getNearestTargetToNow,
  getSpatiallyAdjacentTarget,
} from "@web/grid/shortcuts/focus-adjacent-grid-event";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE,
  promptShortcutUnavailableWhileEditingEvent,
} from "@web/shortcuts/prompt-shortcut-unavailable";
import { swallowNextKeyup } from "@web/shortcuts/swallow-next-keyup";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import {
  useAppShortcut,
  WRITE_EDIT_SHORTCUT,
} from "@web/shortcuts/useAppShortcut";
import { deleteEventAndDiscardDraft } from "@web/views/Forms/hooks/useDeleteEvent";

// Fallback when the grid can't be measured, matching EventForm's all-day->timed toggle.
const DEFAULT_TIMED_START_MINUTE = 9 * 60;

const DRAFT_MOVEMENT_HOTKEY_OPTIONS = {
  ignoreInputs: false,
  preventDefault: false,
  stopPropagation: false,
} as const;

const SPATIAL_DIRECTION = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
} as const;

const isArrowKey = (key: string): key is keyof typeof SPATIAL_DIRECTION =>
  key in SPATIAL_DIRECTION;

const isFocusInSidebar = () =>
  Boolean(document.activeElement?.closest(`#${ID_SIDEBAR}`));

/** Form-open, typing in the form, or sidebar focus: grid edit keys stand down. */
const isGridEditShortcutBlocked = (keyboardEvent: KeyboardEvent) =>
  isEventFormOpen() ||
  isEventFormKeyboardTarget(keyboardEvent) ||
  isFocusInSidebar();

const claimShortcut = (keyboardEvent: KeyboardEvent) => {
  keyboardEvent.preventDefault();
  keyboardEvent.stopPropagation();
};

/**
 * First visit / returning from another tab / calendar canvas: nothing
 * particular is focused. The timed grid and week scroller are WCAG
 * scrollable regions (`tabIndex=0`), not interactive controls — treating
 * them as unspecified is what lets Arrow keys enter the event list after
 * a click on the calendar.
 */
const isUnspecifiedDocumentFocus = () => {
  const active = document.activeElement;
  if (
    active == null ||
    active === document.body ||
    active === document.documentElement
  ) {
    return true;
  }
  if (!(active instanceof HTMLElement)) return false;
  return active.id === ID_GRID_MAIN || active.id === ID_WEEK_GRID_SCROLLER;
};

// Week view: refuse moves that would leave the visible week window.
const isOutsideVisibleWeek = (
  date: Dayjs,
  days: number,
  weekDays: Dayjs[],
): boolean =>
  (days === -1 && !date.isAfter(weekDays[0], "day")) ||
  (days === 1 && !date.isBefore(weekDays[weekDays.length - 1], "day"));

/**
 * Form-closed grid draft whose card currently has DOM focus. Drafts stamp
 * interaction ids but are not registered as saved drag/resize targets, so
 * `targeting.getFocused()` cannot see them.
 */
const getFocusedFormClosedDraft = (): GridEvent | null => {
  if (isEventFormOpen()) return null;

  const { gridDraft } = useDraftStore.getState();
  if (!gridDraft) return null;

  const draftId = getGridDraftId(gridDraft);
  if (!draftId) return null;

  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (getCalendarEventIdFromElement(active) !== draftId) return null;

  return gridEventDraftToGridEvent(gridDraft);
};

const applyNudgedDatesToDraft = (
  draft: GridEventDraft,
  nudgedEvent: GridEvent,
) => {
  const start = dayjs(nudgedEvent.startDate).toDate();
  const end = dayjs(nudgedEvent.endDate).toDate();
  const schedule =
    draft.values.schedule.kind === "allDay"
      ? { kind: "allDay" as const, start, end }
      : { ...draft.values.schedule, start, end };
  return replaceGridDraftSchedule(draft, schedule);
};

export type GridEventEditDayBoundary =
  | {
      kind: "follow";
      /** Day view: navigate so a day-crossing nudge stays on screen. */
      onCrossed: (date: Dayjs) => void;
    }
  | {
      kind: "clamp";
      /** Week view: nudges that leave the visible week window shift it. */
      weekDays: Dayjs[];
      /**
       * Carry a whole-event nudge across the window edge by shifting the
       * view (days is the nudge direction; eventId is the carried event, for
       * restoring focus after the shifted window renders). Absent: refuse
       * the nudge (edge nudges always refuse - resizing across the window is
       * not a flow).
       */
      onCrossed?: (days: 1 | -1, eventId: string) => void;
    };

/**
 * Shared Delete / Mod+D / Mod+C+V copy-paste / Shift+arrow nudge / draft Arrow
 * reposition / focus traversal shortcuts for Day and Week. Targeting,
 * day-boundary policy, and draft reposition stay view-specific (Day follows
 * across midnight; Week clamps to weekDays).
 *
 * Handlers close over latest render values; TanStack Hotkeys syncs the
 * callback each render, so event-list refs are unnecessary.
 */
export function useGridEventEditShortcuts({
  allDayEvents = [],
  dayBoundary,
  dependencies = {},
  placeTimedDraft,
  repositionDraftByKey,
  targeting,
  timedEvents,
}: {
  allDayEvents?: GridEvent[];
  dayBoundary: GridEventEditDayBoundary;
  dependencies?: EventMutationDependencies;
  /**
   * Shift+Arrow place-create when nothing is focused and no draft can move.
   * Seeds a timed draft at the same default as `c`, form closed.
   */
  placeTimedDraft?: () => void;
  /**
   * View-owned draft move. Return true when the draft moved so the shared
   * hook can preventDefault. Day may also navigate here on day-cross.
   */
  repositionDraftByKey: (key: string) => boolean;
  targeting: {
    focus: (target: FocusableGridEventTarget) => void;
    /** Registry-backed: the gate for any action that mutates the event. */
    getFocused: () => GridEventShortcutTarget | null;
    /** Also sees read-only cards - navigation only, never edits. */
    getFocusedNavigable: () => FocusableGridEventTarget | null;
    /** Also lists read-only cards - navigation only, never edits. */
    listNavigable: () => FocusableGridEventTarget[];
  };
  timedEvents: GridEvent[];
}) {
  const calendarLookup = useCalendarLookup();
  const { data: calendars } = useCalendarsQuery();
  const defaultCalendar = useDefaultTargetCalendar(calendars ?? []);
  const queryClient = useQueryClient();
  const { create: createEvent, delete: deleteEvent } =
    useEventMutations(dependencies);
  const updateEvent = useUpdateEvent(dependencies);

  // Focused only (no hover/first-visible fallback): edit actions must
  // demand an explicit target.
  const getFocusedMutableCalendarEvent = () => {
    const target = targeting.getFocused();
    if (!target) return null;

    const event = findCalendarEventForTarget(target, {
      allDayEvents,
      timedEvents,
    });
    if (!event) return null;

    if (isGridEventInteractionReadOnly(calendarLookup, event)) {
      return null;
    }

    return event;
  };

  const deleteFocusedCalendarEvent = (keyboardEvent: KeyboardEvent) => {
    if (
      isDeleteTextEditingTarget(keyboardEvent) ||
      isEventFormKeyboardTarget(keyboardEvent)
    ) {
      return;
    }

    if (isFocusInSidebar()) return;

    const event = getFocusedMutableCalendarEvent();
    if (!event) return;

    claimShortcut(keyboardEvent);
    deleteEventAndDiscardDraft(deleteEvent, event);
  };

  const duplicateSourceEvent = (sourceEvent: Event) => {
    const committed = commitDuplicateEvent({
      source: sourceEvent,
      calendars: calendars ?? [],
      defaultCalendarId: defaultCalendar?.id,
      create: createEvent,
    });
    if (committed) return;

    // No writable calendar could be resolved for the copy - fall back to
    // the create-draft form so the user can pick one.
    const duplicate = duplicateGridEventDraft(sourceEvent, calendars ?? []);
    if (!duplicate) return;

    draftActions.startGridDraft({ activity: "gridClick", draft: duplicate });
  };

  const duplicateFocusedCalendarEvent = (keyboardEvent: KeyboardEvent) => {
    if (isGridEditShortcutBlocked(keyboardEvent)) return;

    const gridEvent = getFocusedMutableCalendarEvent();
    if (!gridEvent?._id) return;

    const sourceEvent = findEventInCache(queryClient, gridEvent._id);
    if (!sourceEvent) return;

    claimShortcut(keyboardEvent);
    duplicateSourceEvent(sourceEvent);
  };

  const copyFocusedCalendarEvent = (keyboardEvent: KeyboardEvent) => {
    // Always swallow: macOS replays a meta-released C keyup that would
    // otherwise match the create-event shortcut.
    swallowNextKeyup("c");
    if (isGridEditShortcutBlocked(keyboardEvent)) return;

    const eventId = targeting.getFocusedNavigable()?.eventId;
    if (!eventId) return;

    const sourceEvent = findEventInCache(queryClient, eventId);
    if (!sourceEvent) return;

    claimShortcut(keyboardEvent);
    eventClipboardActions.copy(sourceEvent);
  };

  const pasteCopiedCalendarEvent = (keyboardEvent: KeyboardEvent) => {
    // Always swallow: macOS replays a meta-released V keyup that would
    // otherwise match Join Up Next.
    swallowNextKeyup("v");
    if (isGridEditShortcutBlocked(keyboardEvent)) return;

    const sourceEvent = useEventClipboardStore.getState().event;
    if (!sourceEvent) return;

    claimShortcut(keyboardEvent);
    duplicateSourceEvent(sourceEvent);
  };

  const describeEdgeDate = (event: GridEvent, edge: EventEdge) => {
    const date = edge === "startDate" ? event.startDate : event.endDate;
    if (!date) return "";
    const label = event.isAllDay
      ? dayjs(date).format("MMM D")
      : dayjs(date).format("h:mm A");
    const edgeName = edge === "startDate" ? "Start" : "End";
    return `${edgeName} ${label}`;
  };

  const wouldAllDayEdgeLeaveVisibleWeek = (
    event: GridEvent,
    edge: EventEdge,
    movement: { days: number },
  ) => {
    if (dayBoundary.kind !== "clamp" || !event.isAllDay) return false;

    // All-day endDate is stored exclusive (the day after the last occupied
    // day), so it's shifted back a day to compare against the inclusive
    // weekDays window — matching nudgeAllDayEdgeDates's own inclusiveEnd.
    const edgeDate =
      edge === "startDate"
        ? dayjs(event.startDate)
        : dayjs(event.endDate).subtract(1, "day");
    return isOutsideVisibleWeek(edgeDate, movement.days, dayBoundary.weekDays);
  };

  // Day view: navigate so a day-crossing move keeps the event on screen.
  const followAcrossMidnight = (
    previousStart: Dayjs,
    nudgedEvent: GridEvent,
  ) => {
    if (dayBoundary.kind !== "follow") return;
    const nextStart = dayjs(nudgedEvent.startDate).startOf("day");
    if (!nextStart.isSame(previousStart, "day")) {
      dayBoundary.onCrossed(nextStart);
    }
  };

  // Nudge one edge of a focused card. `commit` is the only difference between
  // a saved event (persist the update) and a form-closed draft (rewrite the
  // draft schedule and, on Day, follow across midnight).
  const moveFocusedEdge = (
    keyboardEvent: KeyboardEvent,
    event: GridEvent,
    edge: EventEdge,
    commit: (nudgedEvent: GridEvent) => void,
    afterNudge?: (nudgedEvent: GridEvent) => void,
  ) => {
    if (!event._id) return;

    const movement = getArrowKeyMovement(
      keyboardEvent.key,
      Boolean(event.isAllDay),
    );
    if (!movement) return;
    if (wouldAllDayEdgeLeaveVisibleWeek(event, edge, movement)) return;

    nudgeEventEdgeFromKeyboard({
      edge,
      event,
      keyboardEvent,
      onNudge: (nudgedEvent, nextEdge) => {
        shortcutHintProgressActions.demonstrate("edge-focus");
        commit(nudgedEvent);
        edgeFocusActions.setEdge(
          event._id!,
          nextEdge,
          describeEdgeDate(nudgedEvent, nextEdge),
        );
        afterNudge?.(nudgedEvent);
      },
    });
  };

  const moveFocusedEventEdge = (
    keyboardEvent: KeyboardEvent,
    event: GridEvent,
    edge: EventEdge,
  ) =>
    moveFocusedEdge(keyboardEvent, event, edge, (nudgedEvent) => {
      updateEvent({ event: nudgedEvent }, true, {
        onOptimisticApplied: () => draftActions.discard(),
      });
    });

  const moveFocusedDraftEdge = (
    keyboardEvent: KeyboardEvent,
    event: GridEvent,
    edge: EventEdge,
  ) => {
    const { gridDraft } = useDraftStore.getState();
    if (!gridDraft) return;

    const previousStart = dayjs(event.startDate).startOf("day");
    moveFocusedEdge(
      keyboardEvent,
      event,
      edge,
      (nudgedEvent) =>
        draftActions.setGridDraft(
          applyNudgedDatesToDraft(gridDraft, nudgedEvent),
        ),
      (nudgedEvent) => followAcrossMidnight(previousStart, nudgedEvent),
    );
  };

  const moveFocusedCalendarEvent = (keyboardEvent: KeyboardEvent) => {
    if (isEventFormOpen()) return;

    const event = getFocusedMutableCalendarEvent();
    if (event?._id) {
      if (isGridEventScheduleLocked(calendarLookup, event)) {
        return;
      }

      const edgeFocus = useEdgeFocusStore.getState();
      if (edgeFocus.eventId === event._id && edgeFocus.edge) {
        moveFocusedEventEdge(keyboardEvent, event, edgeFocus.edge);
        return;
      }

      if (event.isAllDay && keyboardEvent.key === "ArrowDown") {
        if (!event._id) return;
        keyboardEvent.preventDefault();
        const startMinute =
          getVisibleGridStartMinute() ?? DEFAULT_TIMED_START_MINUTE;
        const dates = convertAllDayToTimedDates(event, startMinute);
        updateEvent({ event: { ...event, ...dates, isAllDay: false } }, true, {
          onOptimisticApplied: () => draftActions.discard(),
        });
        refocusEventElement(event._id);
        return;
      }

      const movement = getArrowKeyMovement(
        keyboardEvent.key,
        Boolean(event.isAllDay),
      );
      if (!movement) return;

      const crossesWeekWindow =
        dayBoundary.kind === "clamp" &&
        isOutsideVisibleWeek(
          dayjs(event.startDate),
          movement.days,
          dayBoundary.weekDays,
        );
      // Without a carry handler the window edge is a wall (old behavior).
      if (
        crossesWeekWindow &&
        !(dayBoundary.kind === "clamp" && dayBoundary.onCrossed)
      ) {
        return;
      }

      const previousStart = dayjs(event.startDate).startOf("day");

      nudgeEventFromKeyboard({
        event,
        keyboardEvent,
        onNudge: (nudgedEvent) => {
          shortcutHintProgressActions.demonstrate("nudge");
          updateEvent({ event: nudgedEvent }, true, {
            onOptimisticApplied: () => draftActions.discard(),
          });
          followAcrossMidnight(previousStart, nudgedEvent);
          if (
            crossesWeekWindow &&
            dayBoundary.kind === "clamp" &&
            (movement.days === 1 || movement.days === -1) &&
            nudgedEvent._id
          ) {
            dayBoundary.onCrossed?.(movement.days, nudgedEvent._id);
          }
        },
      });
      return;
    }

    // No focused mutable saved event: if a form-closed draft has an edge
    // focused, nudge that edge. Otherwise reposition the whole draft, or
    // place one when the grid is idle. Do not place over an existing draft
    // (failed clamp/midnight move) or while a read-only/draft card is focused.
    const draftEvent = getFocusedFormClosedDraft();
    if (draftEvent?._id) {
      const edgeFocus = useEdgeFocusStore.getState();
      if (edgeFocus.eventId === draftEvent._id && edgeFocus.edge) {
        moveFocusedDraftEdge(keyboardEvent, draftEvent, edgeFocus.edge);
        return;
      }
    }

    const didMoveDraft = repositionDraftByKey(keyboardEvent.key);
    if (didMoveDraft) {
      claimShortcut(keyboardEvent);
      return;
    }

    // getFocusedNavigable, not getFocused: a focused read-only card is still a
    // focused card, and the guard's job is to not drop a new draft under one.
    if (targeting.getFocusedNavigable() || useDraftStore.getState().gridDraft) {
      return;
    }

    placeTimedDraft?.();
  };

  const cycleEdgeFocus = (keyboardEvent: KeyboardEvent) => {
    // Form fields and the sidebar keep native Tab. Explain when the form is
    // open and Tab would otherwise no-op on the grid.
    if (isEditableKeyboardTarget(keyboardEvent) || isFocusInSidebar()) return;
    if (isEventFormOpen()) {
      if (!isEventFormKeyboardTarget(keyboardEvent)) {
        promptShortcutUnavailableWhileEditingEvent();
      }
      return;
    }

    const event =
      getFocusedMutableCalendarEvent() ?? getFocusedFormClosedDraft();
    if (!event?._id) return;

    const forward = !keyboardEvent.shiftKey;
    const { eventId, edge } = useEdgeFocusStore.getState();
    const currentEdge = eventId === event._id ? edge : null;
    // Forward enters at the start edge and exits (natively, past the end
    // edge) rather than wrapping — an unconditional wrap would trap keyboard
    // focus on the card forever, since Tab is the only way in or out.
    const exiting = forward
      ? currentEdge === "endDate"
      : currentEdge === "startDate";
    if (exiting) {
      edgeFocusActions.reset();
      return;
    }

    claimShortcut(keyboardEvent);
    edgeFocusActions.cycle(event._id, forward ? "forward" : "backward");
  };

  const onEscape = () => {
    if (isHigherEscapeOwner()) return;
    if (useEdgeFocusStore.getState().eventId) {
      edgeFocusActions.reset();
      return;
    }

    const { gridDraft, status } = useDraftStore.getState();
    if (
      status?.activity === "keyboardPlace" &&
      !status.isFormOpen &&
      gridDraft
    ) {
      draftActions.discard();
    }
  };

  // `targeting` is a fresh object every render for some callers (Day/Week
  // build it inline), so the settle effect below reads it through a ref
  // instead of depending on it directly — otherwise it would tear down and
  // rebuild its listeners on every unrelated re-render, which can cancel a
  // check that was already in flight.
  const targetingRef = useRef(targeting);
  targetingRef.current = targeting;

  // Edge focus tracks a specific event's DOM element, which React replaces
  // after every committed nudge (refocusEventElement restores focus to the
  // new element within a few frames). A focusin landing on a *different*
  // event is unambiguous and resets immediately. A focusin/focusout landing
  // on nothing (the brief focus-to-body gap mid-remount) is ambiguous, so
  // that case alone waits a tick for refocusEventElement to restore focus
  // before treating it as "focus left the event".
  // Draft cards are not registered, so targeting.getFocused() is null while
  // a draft is still focused — resolve those via the draft store + DOM id.
  useEffect(() => {
    let timer = 0;
    const resolveFocusedEventId = () =>
      targetingRef.current.getFocused()?.eventId ??
      getFocusedFormClosedDraft()?._id ??
      null;
    const checkAfterDelay = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const { eventId } = useEdgeFocusStore.getState();
        if (!eventId) return;
        if (resolveFocusedEventId() !== eventId) {
          edgeFocusActions.reset();
        }
      }, 0);
    };
    const sync = () => {
      const { eventId } = useEdgeFocusStore.getState();
      if (!eventId) return;

      const focusedId = resolveFocusedEventId();
      if (!focusedId) {
        checkAfterDelay();
        return;
      }
      if (focusedId !== eventId) {
        window.clearTimeout(timer);
        edgeFocusActions.reset();
      }
    };

    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, []);

  const moveDraftOrFocusAdjacent = (keyboardEvent: KeyboardEvent) => {
    if (isEditableKeyboardTarget(keyboardEvent)) return;

    const didMove = repositionDraftByKey(keyboardEvent.key);
    if (didMove) {
      claimShortcut(keyboardEvent);
      return;
    }

    if (isEventFormOpen()) return;
    if (!isArrowKey(keyboardEvent.key)) return;

    const focused = targeting.getFocusedNavigable();
    const visible = targeting.listNavigable();

    // Day view: all four arrows move chronological focus. Period changes stay
    // on j/k (same split as week view: arrows focus, j/k navigate). Week uses
    // spatial adjacency across the visible days. With no event focused and
    // no particular control focused, the first arrow seeds the nearest-to-now
    // event instead of no-op'ing.
    let adjacent: FocusableGridEventTarget | null = null;
    if (focused) {
      adjacent =
        dayBoundary.kind === "follow"
          ? getChronologicallyAdjacentTarget({
              allDayEvents,
              direction:
                keyboardEvent.key === "ArrowUp" ||
                keyboardEvent.key === "ArrowLeft"
                  ? "previous"
                  : "next",
              focused,
              timedEvents,
              visible,
            })
          : getSpatiallyAdjacentTarget({
              allDayEvents,
              direction: SPATIAL_DIRECTION[keyboardEvent.key],
              focused,
              timedEvents,
              visible,
              weekDays: dayBoundary.weekDays,
            });
    } else if (isUnspecifiedDocumentFocus()) {
      adjacent = getNearestTargetToNow({
        allDayEvents,
        timedEvents,
        visible,
      });
    }
    if (!adjacent) return;

    claimShortcut(keyboardEvent);
    adjacent.element.scrollIntoView({ block: "nearest" });
    targeting.focus(adjacent);
  };

  useAppShortcut("Delete", deleteFocusedCalendarEvent, {
    ...WRITE_EDIT_SHORTCUT,
    ignoreInputs: false,
  });
  useAppShortcut("Mod+D", duplicateFocusedCalendarEvent, {
    ...WRITE_EDIT_SHORTCUT,
    ignoreInputs: false,
  });
  useAppShortcut("Mod+C", copyFocusedCalendarEvent, {
    ...WRITE_EDIT_SHORTCUT,
    ignoreInputs: true,
  });
  useAppShortcut("Mod+V", pasteCopiedCalendarEvent, {
    ...WRITE_EDIT_SHORTCUT,
    ignoreInputs: true,
  });
  useAppShortcut(
    KEYMAP.moveFocus.hotkeys.up,
    moveDraftOrFocusAdjacent,
    DRAFT_MOVEMENT_HOTKEY_OPTIONS,
  );
  useAppShortcut(
    KEYMAP.moveFocus.hotkeys.down,
    moveDraftOrFocusAdjacent,
    DRAFT_MOVEMENT_HOTKEY_OPTIONS,
  );
  useAppShortcut(
    KEYMAP.moveFocus.hotkeys.left,
    moveDraftOrFocusAdjacent,
    DRAFT_MOVEMENT_HOTKEY_OPTIONS,
  );
  useAppShortcut(
    KEYMAP.moveFocus.hotkeys.right,
    moveDraftOrFocusAdjacent,
    DRAFT_MOVEMENT_HOTKEY_OPTIONS,
  );
  useAppShortcut(KEYMAP.moveEvent.hotkeys.up, moveFocusedCalendarEvent, {
    ...WRITE_EDIT_SHORTCUT,
    telemetryHintId: "nudge",
  });
  useAppShortcut(KEYMAP.moveEvent.hotkeys.down, moveFocusedCalendarEvent, {
    ...WRITE_EDIT_SHORTCUT,
    telemetryHintId: "nudge",
  });
  useAppShortcut(KEYMAP.moveEvent.hotkeys.left, moveFocusedCalendarEvent, {
    ...WRITE_EDIT_SHORTCUT,
    telemetryHintId: "nudge",
  });
  useAppShortcut(KEYMAP.moveEvent.hotkeys.right, moveFocusedCalendarEvent, {
    ...WRITE_EDIT_SHORTCUT,
    telemetryHintId: "nudge",
  });
  useAppShortcut(KEYMAP.edgeFocus.hotkey, cycleEdgeFocus, {
    ...DRAFT_MOVEMENT_HOTKEY_OPTIONS,
    ...WRITE_EDIT_SHORTCUT,
    overlayUnavailableMessage: EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE,
    telemetryHintId: "edge-focus",
  });
  useAppShortcut("Shift+Tab", cycleEdgeFocus, {
    ...DRAFT_MOVEMENT_HOTKEY_OPTIONS,
    overlayUnavailableMessage: EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE,
    telemetryHintId: "edge-focus",
  });
  useAppShortcut("Escape", onEscape, DRAFT_MOVEMENT_HOTKEY_OPTIONS);
}
