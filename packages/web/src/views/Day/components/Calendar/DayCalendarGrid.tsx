import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CalendarId,
  CalendarIdSchema,
} from "@core/types/domain-primitives";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { shouldShowContextualLoadError } from "@web/api/util/api.util";
import {
  isFirstImportFailed,
  isFirstImportInProgress,
} from "@web/auth/providers/connect.util";
import { useConnectGoogle } from "@web/auth/providers/useConnectProvider";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { getWritableCalendars } from "@web/calendars/calendar.util";
import {
  useConnectedAccounts,
  useDefaultTargetCalendar,
} from "@web/calendars/useDefaultTargetCalendar";
import { type GridEvent } from "@web/common/types/web.event.types";
import { onViewCommand } from "@web/common/utils/dom/view-command-bus";
import {
  createAlldayDraft,
  createTimedDraft,
  startTimedDraftAt,
  timedDraftEnd,
} from "@web/common/utils/draft/draft.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraftFromGridEvent,
  getGridDraftId,
} from "@web/events/grid-event-draft.adapter";
import { useDayEventViewModel } from "@web/events/queries/useDayEventsQuery";
import {
  draftActions,
  selectGridDraft,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { EventGrid, isEventGridLoading } from "@web/grid/components/EventGrid";
import { useGridMeasurements } from "@web/grid/hooks/useGridMeasurements";
import { withAllDayColumnTints } from "@web/grid/utils/allDayColumnTint.util";
import { EditSequenceMenu } from "@web/shortcuts/edit-sequence/EditSequenceMenu";
import { PageJumpHints } from "@web/shortcuts/page-jump/PageJumpHints";
import { buildDayPageJumpTargets } from "@web/shortcuts/page-jump/page-jump.targets";
import { QuickTimeSlots } from "@web/shortcuts/quick-time/QuickTimeSlots";
import {
  buildQuickTimeSlots,
  timedEventsToBusyIntervals,
} from "@web/shortcuts/quick-time/quick-time.util";
import {
  eventJumpActions,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { ShiftHintOverlay } from "@web/shortcuts/shift-hint/ShiftHintOverlay";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { dayEventQueryRange } from "@web/views/Day/hooks/events/useDayEvents";
import { useDateInView } from "@web/views/Day/hooks/navigation/useDateInView";
import { useDateNavigation } from "@web/views/Day/hooks/navigation/useDateNavigation";
import { useDayEventNudgeShortcuts } from "@web/views/Day/hooks/shortcuts/useDayEventNudgeShortcuts";
import { useToday } from "@web/views/Week/hooks/useToday";
import { DayCalendarBusyPeriodsLayer } from "./DayCalendarBusyPeriods";
import { DayCalendarColumnHeaders } from "./DayCalendarColumnHeaders";
import { useDayCalendarContextMenu } from "./DayCalendarContextMenu";
import {
  DayCalendarAllDayEventsLayer,
  DayCalendarTimedEventsLayer,
} from "./DayCalendarEventLayers";
import { assignDayAllDayEventRows } from "./dayAllDayRows.util";
import { getFocusedDayColumnCalendarId } from "./dayCalendarColumnFocus.util";
import {
  addVisibleDraftEvent,
  getCalendarEventIdSet,
} from "./dayCalendarDraft.util";
import { useDayCalendarColumns } from "./useDayCalendarColumns";
import { useDayCalendarScrollToNow } from "./useDayCalendarScrollToNow";

export function DayCalendarGrid() {
  const dateInView = useDateInView();
  const { navigateToDate } = useDateNavigation();
  const { today } = useToday();
  const { data: calendars = [], isPending: isCalendarsPending } =
    useCalendarsQuery();
  // Seed shortcuts with the form's default create target, not day-column order.
  const defaultTargetCalendarId =
    useDefaultTargetCalendar(calendars)?.id ?? null;
  const {
    allDayEvents,
    error: eventsError,
    events: dayEvents,
    isError: isErrorEvents,
    isFetching,
    isPending,
    refetch,
    timedEvents,
  } = useDayEventViewModel(dayEventQueryRange(dateInView));
  // Session expiry already surfaces SessionExpiredToast — don't also show
  // "Couldn't load events" / Retry for the same failure.
  const showEventsLoadError = shouldShowContextualLoadError(
    isErrorEvents,
    eventsError,
  );
  const isLoadingEvents = isEventGridLoading(
    isPending,
    showEventsLoadError,
    isFetching,
  );
  const { connection, refresh, state: googleState } = useConnectGoogle();
  // See Grid.tsx's Week-view equivalent: googleState alone can't tell a
  // first-ever import apart from routine catch-up on an established account.
  const isImportingEmpty =
    !isPending &&
    !showEventsLoadError &&
    dayEvents.length === 0 &&
    googleState === "IMPORTING" &&
    isFirstImportInProgress(connection);
  const isImportFailed =
    !isPending &&
    !showEventsLoadError &&
    dayEvents.length === 0 &&
    isFirstImportFailed(connection);
  const {
    calendarColumnIndexById,
    displayedAllDayEvents,
    displayedCalendars,
    displayedTimedEvents,
    getCalendarColumnIndex,
    isDisplayedEvent,
    visibleDates,
  } = useDayCalendarColumns({ allDayEvents, dateInView, timedEvents });
  const connectedAccounts = useConnectedAccounts();
  const writableDisplayedCalendars = useMemo(
    () =>
      getWritableCalendars(displayedCalendars, {
        hasConnectedAccount: connectedAccounts.length > 0,
      }),
    [connectedAccounts.length, displayedCalendars],
  );
  const writableCalendarIds = useMemo(
    () =>
      new Set<string>(
        writableDisplayedCalendars.map((calendar) => calendar.id),
      ),
    [writableDisplayedCalendars],
  );
  const pageJumpTargets = useMemo(
    () =>
      buildDayPageJumpTargets(writableDisplayedCalendars, connectedAccounts),
    [connectedAccounts, writableDisplayedCalendars],
  );
  const [focusedColumnKey, setFocusedColumnKey] = useState<string | null>(null);
  const { gridRefs, measurements } = useGridMeasurements({
    visibleDateCount: visibleDates.length,
  });
  const gridDraft = useDraftStore(selectGridDraft);
  // Strip height must include the all-day draft: layer rendering used to
  // re-stack with the draft while EventGrid still sized from saved events only.
  const savedAllDayEventIds = useMemo(
    () => getCalendarEventIdSet(displayedAllDayEvents),
    [displayedAllDayEvents],
  );
  const { allDayEvents: renderedAllDayEvents, rowsCount: allDayRowsCount } =
    useMemo(() => {
      const withDraft = addVisibleDraftEvent({
        draft: gridDraft,
        events: displayedAllDayEvents,
        isAllDay: true,
        visibleDates,
      }).filter(isDisplayedEvent);
      return assignDayAllDayEventRows(withDraft, getCalendarColumnIndex);
    }, [
      displayedAllDayEvents,
      getCalendarColumnIndex,
      gridDraft,
      isDisplayedEvent,
      visibleDates,
    ]);

  const tintedVisibleDates = useMemo(
    () => withAllDayColumnTints(visibleDates, renderedAllDayEvents, "calendar"),
    [renderedAllDayEvents, visibleDates],
  );

  useDayCalendarScrollToNow(gridRefs.mainGridRef);

  const openGridDraftForm = useCallback((draft: GridEventDraft) => {
    draftActions.startGridDraft({ activity: "gridClick", draft });
  }, []);

  const openEventFormForEvent = useCallback(
    (event: GridEvent) => {
      if (!event._id) {
        return;
      }

      const currentDraft = useDraftStore.getState().gridDraft;
      if (currentDraft && getGridDraftId(currentDraft) === event._id) {
        // Form-closed place-create (and other live drafts): open details
        // without reseeding the draft from the card.
        draftActions.setFormOpen(true);
        return;
      }

      const sourceEvent = dayEvents.find(
        (candidate) => candidate.id === event._id,
      );
      const draft = createGridEventDraftFromGridEvent(event, sourceEvent);
      if (!draft) {
        return;
      }

      openGridDraftForm(draft);
    },
    [dayEvents, openGridDraftForm],
  );

  // timedEvents/allDayEvents are the same GridEvent objects the grid
  // layers render from (assembled once in event.view-model.ts), so the
  // context menu/right-click lookup reuses them directly instead of
  // re-deriving a fresh GridEvent from `dayEvents` (Event[]).
  const dayGridEventsById = useMemo(() => {
    const map = new Map<string, GridEvent>();
    for (const gridEvent of [
      ...displayedTimedEvents,
      ...displayedAllDayEvents,
    ]) {
      if (gridEvent._id) map.set(gridEvent._id, gridEvent);
    }
    return map;
  }, [displayedAllDayEvents, displayedTimedEvents]);

  const getDayEventById = useCallback(
    (eventId: string): GridEvent | null =>
      dayGridEventsById.get(eventId) ?? null,
    [dayGridEventsById],
  );

  const { contextMenu, handleContextMenu } = useDayCalendarContextMenu({
    getDayEventById,
    onOpenEvent: openEventFormForEvent,
  });

  const resolveShortcutCalendarId = useCallback((): CalendarId | null => {
    const focusedColumnId = getFocusedDayColumnCalendarId();
    if (focusedColumnId && writableCalendarIds.has(focusedColumnId)) {
      const parsed = CalendarIdSchema.safeParse(focusedColumnId);
      if (parsed.success) return parsed.data;
    }
    return defaultTargetCalendarId;
  }, [defaultTargetCalendarId, writableCalendarIds]);

  const openShortcutDraft = useCallback(
    (createDraft: () => void, openForm = true) => {
      if (gridDraft) {
        return;
      }
      // Avoid locking in calendarId: null while the calendars query is still
      // loading; the form would show the default once data arrives.
      if (isCalendarsPending && !defaultTargetCalendarId) {
        return;
      }

      createDraft();
      if (openForm) {
        draftActions.setFormOpen(true);
      }
    },
    [defaultTargetCalendarId, gridDraft, isCalendarsPending],
  );

  const createAllDayDraftFromShortcut = useCallback(() => {
    // A blocked click on the all-day row aimed at a specific day; honor it
    // over the day in view, then spend the intent.
    const pointerDateKey = useEventJumpStore.getState().pointerDraftDateKey;
    const start = pointerDateKey
      ? dayjs(pointerDateKey).tz(getEffectiveTimeZone(), true)
      : dateInView;

    openShortcutDraft(() =>
      createAlldayDraft(start, "createShortcut", resolveShortcutCalendarId()),
    );
    eventJumpActions.setPointerDraftIntent(null);
  }, [dateInView, openShortcutDraft, resolveShortcutCalendarId]);

  const createTimedDraftFromShortcut = useCallback(
    () =>
      openShortcutDraft(() =>
        createTimedDraft(
          dateInView,
          "createShortcut",
          resolveShortcutCalendarId(),
        ),
      ),
    [dateInView, openShortcutDraft, resolveShortcutCalendarId],
  );

  // Form stays closed so Shift+Arrow can keep repositioning; Enter opens it.
  // Existing-draft / focus guards also live in useGridEventEditShortcuts.
  const placeTimedDraftFromShortcut = useCallback(
    () =>
      openShortcutDraft(
        () =>
          createTimedDraft(
            dateInView,
            "keyboardPlace",
            resolveShortcutCalendarId(),
          ),
        false,
      ),
    [dateInView, openShortcutDraft, resolveShortcutCalendarId],
  );
  // Typed-time create lands on the day being viewed, form closed and card
  // focused, matching placeTimedDraftFromShortcut above.
  const createDraftAtTime = useCallback(
    (start: Dayjs) =>
      openShortcutDraft(
        () =>
          startTimedDraftAt(
            start.format(),
            timedDraftEnd(start).format(),
            "keyboardPlace",
            resolveShortcutCalendarId(),
          ),
        false,
      ),
    [openShortcutDraft, resolveShortcutCalendarId],
  );

  const getQuickTimeDay = useCallback(() => dateInView, [dateInView]);
  const visibleDays = useMemo(() => [dateInView], [dateInView]);

  const { getEditSequenceAnchor, shiftHints } = useDayEventNudgeShortcuts({
    allDayEvents: displayedAllDayEvents,
    createDraftAtTime,
    getQuickTimeDay,
    navigateToDate,
    placeTimedDraft: placeTimedDraftFromShortcut,
    timedEvents: displayedTimedEvents,
    visibleDays,
  });

  // The placeholder sits in the column the draft would land in - the calendar
  // resolveShortcutCalendarId picks. Occupancy is checked across every column,
  // so a slot busy on any calendar shows no chip; conservative, and it keeps
  // chips off cards regardless of which column they are in.
  const quickTimeSlots = useMemo(() => {
    const now = dayjs().tz(getEffectiveTimeZone());
    return buildQuickTimeSlots({
      busy: timedEventsToBusyIntervals(displayedTimedEvents),
      now,
      targetDay: dateInView,
    });
  }, [dateInView, displayedTimedEvents]);

  const quickTimeCalendarId = resolveShortcutCalendarId();
  const quickTimeColumnIndex = quickTimeCalendarId
    ? calendarColumnIndexById.get(quickTimeCalendarId)
    : undefined;

  // onViewCommand returns its own unsubscribe and emitViewCommand reads the
  // listener set at emit time, so re-subscribing when the handler identity
  // changes is safe — no latest-ref mirror needed.
  useEffect(() => {
    const unsubscribeCreateAllDayDraft = onViewCommand(
      "CREATE_ALLDAY_DRAFT",
      createAllDayDraftFromShortcut,
    );
    const unsubscribeCreateTimedDraft = onViewCommand(
      "CREATE_TIMED_DRAFT",
      createTimedDraftFromShortcut,
    );
    return () => {
      unsubscribeCreateAllDayDraft();
      unsubscribeCreateTimedDraft();
    };
  }, [createAllDayDraftFromShortcut, createTimedDraftFromShortcut]);
  const allDayEventsLayer = useMemo(
    () => (
      <DayCalendarAllDayEventsLayer
        events={renderedAllDayEvents}
        getCalendarColumnIndex={getCalendarColumnIndex}
        draft={gridDraft}
        measurements={measurements}
        onOpenEvent={openEventFormForEvent}
        savedEventIds={savedAllDayEventIds}
        visibleDates={visibleDates}
      />
    ),
    [
      getCalendarColumnIndex,
      gridDraft,
      measurements,
      openEventFormForEvent,
      renderedAllDayEvents,
      savedAllDayEventIds,
      visibleDates,
    ],
  );
  const timedEventsLayer = useMemo(
    () => (
      <>
        <DayCalendarBusyPeriodsLayer
          calendarColumnIndexById={calendarColumnIndexById}
          dateInView={dateInView}
          measurements={measurements}
          visibleDates={visibleDates}
        />
        <QuickTimeSlots
          columnIndex={quickTimeColumnIndex}
          measurements={measurements}
          slots={quickTimeSlots}
          visibleDates={visibleDates}
        />
        <DayCalendarTimedEventsLayer
          events={displayedTimedEvents}
          getCalendarColumnIndex={getCalendarColumnIndex}
          isDisplayedEvent={isDisplayedEvent}
          draft={gridDraft}
          measurements={measurements}
          onOpenEvent={openEventFormForEvent}
          visibleDates={visibleDates}
        />
      </>
    ),
    [
      calendarColumnIndexById,
      dateInView,
      displayedTimedEvents,
      gridDraft,
      getCalendarColumnIndex,
      isDisplayedEvent,
      measurements,
      openEventFormForEvent,
      quickTimeColumnIndex,
      quickTimeSlots,
      visibleDates,
    ],
  );

  return (
    <section
      aria-label="Calendar agenda"
      className="flex h-full min-w-xs flex-1 flex-col bg-background px-0.5 pb-0.5"
      onContextMenu={handleContextMenu}
    >
      <DayCalendarColumnHeaders
        calendars={displayedCalendars}
        focusedColumnKey={focusedColumnKey}
        onColumnFocusChange={setFocusedColumnKey}
        writableCalendarIds={writableCalendarIds}
      />
      <EventGrid
        allDayEventsLayer={allDayEventsLayer}
        allDayRowsCount={allDayRowsCount}
        gridRefs={gridRefs}
        highlightedColumnKey={focusedColumnKey}
        isErrorEvents={showEventsLoadError}
        isImportFailed={isImportFailed}
        isImportingEmpty={isImportingEmpty}
        isLoadingEvents={isLoadingEvents}
        onRetryEvents={() => void refetch()}
        onRetryImport={() => refresh()}
        timedEventsLayer={timedEventsLayer}
        today={today}
        visibleDates={tintedVisibleDates}
      />
      {contextMenu}
      <ShiftHintOverlay hints={shiftHints} />
      <EditSequenceMenu getAnchor={getEditSequenceAnchor} />
      <PageJumpHints targets={pageJumpTargets} />
    </section>
  );
}
