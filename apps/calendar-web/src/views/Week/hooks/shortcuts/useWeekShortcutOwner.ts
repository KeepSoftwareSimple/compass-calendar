import { useCallback, useEffect, useRef } from "react";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { useDefaultTargetCalendar } from "@web/calendars/useDefaultTargetCalendar";
import { onViewCommand } from "@web/common/utils/dom/view-command-bus";
import {
  createAlldayDraft,
  createTimedDraft,
  startTimedDraftAt,
  timedDraftEnd,
} from "@web/common/utils/draft/draft.util";
import { repositionDraftByKeyboard } from "@web/common/utils/draft/reposition-draft-by-keyboard.util";
import { focusCalendarEventElement } from "@web/common/utils/event/event.util";
import { useFocusSidebarShortcut } from "@web/components/Sidebar/useFocusSidebarShortcut";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import {
  draftActions,
  isEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { weekEventTargeting } from "@web/grid/interaction/view-event-registry";
import { useCalendarViewShortcuts } from "@web/grid/shortcuts/useCalendarViewShortcuts";
import { useGridEventEditShortcuts } from "@web/grid/shortcuts/useGridEventEditShortcuts";
import { useGridEventFormFieldSequences } from "@web/grid/shortcuts/useGridEventFormFieldSequences";
import {
  quickTimeDayFromEventStart,
  quickTimeFocusedColumnDay,
  quickTimeTargetDay,
} from "@web/shortcuts/quick-time/quick-time.util";
import {
  eventJumpActions,
  isEventJumpActive,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import {
  type ActiveShiftHint,
  useShiftHoldEventHints,
} from "@web/shortcuts/shift-hint/useShiftHoldEventHints";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { type Util_Scroll } from "@web/views/Week/hooks/grid/useScroll";
import { goToTodayInWeek } from "@web/views/Week/hooks/shortcuts/weekShortcuts.util";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";

export interface ShortcutProps {
  queryEndOfView: Dayjs;
  queryStartOfView: Dayjs;
  startOfView: Dayjs;
  endOfView: Dayjs;
  weekDays: Dayjs[];
  util: WeekProps["util"];
  scrollUtil: Util_Scroll;
}

/**
 * Week shortcut owner: draft create/nav/focus behavior + bus subscription,
 * then thin key registration via `useCalendarViewShortcuts`.
 */
export const useWeekShortcutOwner = ({
  queryEndOfView,
  queryStartOfView,
  startOfView,
  endOfView,
  weekDays,
  util,
  scrollUtil,
}: ShortcutProps): {
  getEditSequenceAnchor: () => HTMLElement | null;
  shiftHints: ActiveShiftHint[];
} => {
  const { data: calendars = [], isPending: isCalendarsPending } =
    useCalendarsQuery();
  const defaultTargetCalendarId =
    useDefaultTargetCalendar(calendars)?.id ?? null;

  const { allDayEvents, timedEvents } = useWeekEventViewModel({
    startOfView: queryStartOfView,
    endOfView: queryEndOfView,
  });
  const { decrementWeek, incrementWeek, goToToday, shiftViewByDay } = util;
  const { scrollToNow } = scrollUtil;

  const discardDraft = useCallback(() => {
    if (isEventFormOpen()) {
      draftActions.discard();
    }
  }, []);

  const goToPreviousWeek = useCallback(() => {
    discardDraft();
    decrementWeek();
  }, [decrementWeek, discardDraft]);

  const toToday = useCallback(() => {
    goToTodayInWeek({ scrollToNow, goToToday });
  }, [scrollToNow, goToToday]);

  const goToNextWeek = useCallback(() => {
    discardDraft();
    incrementWeek();
  }, [incrementWeek, discardDraft]);

  const shiftViewBackward = useCallback(() => {
    discardDraft();
    shiftViewByDay(-1);
  }, [discardDraft, shiftViewByDay]);

  const shiftViewForward = useCallback(() => {
    discardDraft();
    shiftViewByDay(1);
  }, [discardDraft, shiftViewByDay]);

  // Same guard as DayCalendarGrid.openShortcutDraft: do not seed a sticky
  // null calendarId while calendars are still loading.
  const canSeedDraft = !isCalendarsPending || Boolean(defaultTargetCalendarId);

  // Parked click, then a single jump-selected column, then the focused
  // event's day. Null when none of those apply so C can fall back to today
  // and paste can fall back to the copied event's own day.
  const getExplicitTargetDay = useCallback((): Dayjs | null => {
    const { pointerDraftDateKey, activeDayKeys } = useEventJumpStore.getState();
    const focusedColumn = quickTimeFocusedColumnDay(
      pointerDraftDateKey,
      activeDayKeys,
    );
    const focusedEvent =
      weekEventTargeting.getFocusedNavigableGridEventTarget() ??
      weekEventTargeting.getFocusedGridEventTarget();
    const focusedEventDay = quickTimeDayFromEventStart(
      focusedEvent
        ? [...allDayEvents, ...timedEvents].find(
            (event) => event._id === focusedEvent.eventId,
          )?.startDate
        : undefined,
    );
    const day = focusedColumn ?? focusedEventDay ?? null;
    return day ? day.startOf("day") : null;
  }, [allDayEvents, timedEvents]);

  // The day every create gesture lands on: explicit target, then today, then
  // the first visible day. Typed times, C, Shift+C, and Shift+Arrow
  // place-create all share it so "create an event" means the day the user
  // is looking at.
  const getTargetDay = useCallback(() => {
    const now = dayjs().tz(getEffectiveTimeZone());
    return quickTimeTargetDay(
      startOfView,
      endOfView,
      now,
      getExplicitTargetDay(),
    );
  }, [endOfView, getExplicitTargetDay, startOfView]);

  const getPasteTargetDay = useCallback(
    (sourceDay: Dayjs) => getExplicitTargetDay() ?? sourceDay.startOf("day"),
    [getExplicitTargetDay],
  );

  // Spend the column selection once a create has used it, so jump chips do
  // not linger over the new draft. Guarded: turning jump off also announces
  // it, and C from idle should stay silent.
  const consumeTargetDay = useCallback(() => {
    const day = getTargetDay();
    eventJumpActions.setPointerDraftIntent(null);
    if (isEventJumpActive()) eventJumpActions.setActive(false);
    return day;
  }, [getTargetDay]);

  const createAllDayDraftEvent = useCallback(() => {
    if (!canSeedDraft) return;
    void createAlldayDraft(
      consumeTargetDay(),
      "createShortcut",
      defaultTargetCalendarId,
    );
  }, [canSeedDraft, consumeTargetDay, defaultTargetCalendarId]);

  const seedTimedDraft = useCallback(
    (activity: "createShortcut" | "keyboardPlace") => {
      if (!canSeedDraft) return;
      void createTimedDraft(
        consumeTargetDay(),
        activity,
        defaultTargetCalendarId,
      );
    },
    [canSeedDraft, consumeTargetDay, defaultTargetCalendarId],
  );

  const createTimedDraftEvent = useCallback(
    () => seedTimedDraft("createShortcut"),
    [seedTimedDraft],
  );

  // Idle Shift+Arrow place-create. Existing-draft / focused-target guards live
  // in useGridEventEditShortcuts so a failed clamp/midnight move never reseeds.
  const placeTimedDraftEvent = useCallback(
    () => seedTimedDraft("keyboardPlace"),
    [seedTimedDraft],
  );

  // The command palette's create-event rows (event.cmd.constants.ts) can only
  // reach this view through the bus; the C/Shift+C keys below call the create
  // functions directly. Resubscribes when the create handlers change (week in
  // view or default target calendar).
  useEffect(() => {
    const unsubscribeCreateAllDayDraft = onViewCommand(
      "CREATE_ALLDAY_DRAFT",
      createAllDayDraftEvent,
    );
    const unsubscribeCreateTimedDraft = onViewCommand(
      "CREATE_TIMED_DRAFT",
      createTimedDraftEvent,
    );

    return () => {
      unsubscribeCreateAllDayDraft();
      unsubscribeCreateTimedDraft();
    };
  }, [createAllDayDraftEvent, createTimedDraftEvent]);

  useFocusSidebarShortcut();

  const focusFirstCalendarEvent = useCallback(() => {
    const target = weekEventTargeting.getFirstNavigableGridEventTarget();
    if (!target) return;

    weekEventTargeting.focusGridEventTarget(target);
  }, []);

  // getFocused is registry-backed and gates everything that mutates an event.
  // The navigable pair also covers read-only cards, which can be focused and
  // navigated but never edited.
  const targeting = {
    focus: weekEventTargeting.focusGridEventTarget,
    getFocused: weekEventTargeting.getFocusedGridEventTarget,
    getFocusedNavigable: weekEventTargeting.getFocusedNavigableGridEventTarget,
    listNavigable: weekEventTargeting.listNavigableGridEventTargets,
  };

  // Set when a Shift+Arrow nudge carried an event across the window edge;
  // consumed once the shifted window's weekDays land so focus restoration
  // targets the post-shift card rather than a node the shift is about to
  // replace.
  const pendingCarryFocusIdRef = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: weekDays landing is the trigger; the id comes from a ref
  useEffect(() => {
    const eventId = pendingCarryFocusIdRef.current;
    if (!eventId) return;
    pendingCarryFocusIdRef.current = null;
    focusCalendarEventElement(eventId);
  }, [weekDays]);

  useGridEventEditShortcuts({
    allDayEvents,
    timedEvents,
    getPasteTargetDay,
    dayBoundary: {
      kind: "clamp",
      weekDays,
      // Shift+Arrow at the window edge carries the event: the nudge commits
      // and the view slides one day to keep it on screen. Raw shiftViewByDay
      // (not shiftViewForward/Backward) so the carried event's optimistic
      // update isn't discarded with the draft. Focus restoration waits for
      // the shifted window to render (the weekDays effect below) - the
      // nudge's own refocus retries run against the pre-shift DOM.
      onCrossed: (days, eventId) => {
        pendingCarryFocusIdRef.current = eventId;
        shiftViewByDay(days);
      },
    },
    targeting,
    placeTimedDraft: placeTimedDraftEvent,
    repositionDraftByKey: (key, step) => {
      const { gridDraft, status } = useDraftStore.getState();
      const viewStart = startOfView.startOf("day");
      const viewEnd = endOfView.startOf("day");
      const nextDraft = repositionDraftByKeyboard({
        activity: status?.activity,
        draft: gridDraft,
        key,
        step,
        isStartAllowed: (nextStart) => {
          const start = dayjs(nextStart);
          return (
            !start.isBefore(viewStart, "day") && !start.isAfter(viewEnd, "day")
          );
        },
      });
      if (!nextDraft) return false;

      draftActions.setGridDraft(nextDraft);
      return true;
    },
  });

  const { getMenuAnchor: getEditSequenceAnchor } =
    useGridEventFormFieldSequences({
      allDayEvents,
      targeting,
      timedEvents,
    });

  useCalendarViewShortcuts({
    onPrevPeriod: goToPreviousWeek,
    onNextPeriod: goToNextWeek,
    onShiftViewBackward: shiftViewBackward,
    onShiftViewForward: shiftViewForward,
    onGoToToday: toToday,
    onCreateAllDayEvent: createAllDayDraftEvent,
    onCreateTimedEvent: createTimedDraftEvent,
    onFocusCalendar: focusFirstCalendarEvent,
  });

  // Typed-time create. Same guards and same form-closed/card-focused landing
  // as Shift+Arrow place-create, so the two gestures produce the same draft.
  const createDraftAtTime = useCallback(
    (start: Dayjs) => {
      if (!canSeedDraft) return;
      if (useDraftStore.getState().gridDraft) return;

      startTimedDraftAt(
        start.format(),
        timedDraftEnd(start).format(),
        "keyboardPlace",
        defaultTargetCalendarId,
      );
    },
    [canSeedDraft, defaultTargetCalendarId],
  );

  const { hints: shiftHints } = useShiftHoldEventHints({
    allDayEvents,
    createAtTime: createDraftAtTime,
    focus: targeting.focus,
    getQuickTimeDay: getTargetDay,
    listVisible: targeting.listNavigable,
    timedEvents,
    visibleDays: weekDays,
  });

  return { getEditSequenceAnchor, shiftHints };
};
