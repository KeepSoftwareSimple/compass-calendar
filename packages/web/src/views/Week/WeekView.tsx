import { useCallback, useMemo, useRef } from "react";
import { useIsTrialing } from "@web/billing/useIsTrialing";
import { ID_MAIN } from "@web/common/constants/web.constants";
import { useHorizontalNavigation } from "@web/common/hooks/useHorizontalNavigation";
import { CalendarConnectionBannerGate } from "@web/components/CalendarConnectionBanner/CalendarConnectionBannerGate";
import { CommandPalette } from "@web/components/CommandPalette/CommandPalette";
import { COMMAND_PALETTE_PLACEHOLDER } from "@web/components/CommandPalette/more.cmd.constants";
import { ContextMenuWrapper } from "@web/components/ContextMenu/GridContextMenuWrapper";
import { DemoEventsBannerGate } from "@web/components/DemoEventsBanner/DemoEventsBannerGate";
import { SidebarEventDetails } from "@web/components/Sidebar/EventDetails/SidebarEventDetails";
import { ResizableSidebarPanel } from "@web/components/Sidebar/ResizableSidebarPanel";
import { Sidebar } from "@web/components/Sidebar/Sidebar";
import { useSidebarShortcuts } from "@web/components/Sidebar/useSidebarShortcuts";
import { welcomeGuideActions } from "@web/components/WelcomeModal/welcome.guide.store";
import { toDemoEventsRange } from "@web/events/demo-events.util";
import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { PageJumpHints } from "@web/shortcuts/page-jump/PageJumpHints";
import { getShortcutMenuSections } from "@web/shortcuts/shortcuts.registry";
import { TimezoneMismatchBannerGate } from "@web/timezone/TimezoneMismatchBannerGate";
import { Dedication } from "@web/views/Week/components/Dedication/Dedication";
import { Draft } from "@web/views/Week/components/Draft/Draft";
import { Grid } from "@web/views/Week/components/Grid/Grid";
import { WeekGridScrollArea } from "@web/views/Week/components/Grid/WeekGridScrollArea";
import { DayLabels } from "@web/views/Week/components/Header/DayLabels";
import { Header } from "@web/views/Week/components/Header/Header";
import { Shortcuts } from "@web/views/Week/components/Shortcuts";
import { useGridLayout } from "@web/views/Week/hooks/grid/useGridLayout";
import { useScroll } from "@web/views/Week/hooks/grid/useScroll";
import { useVisibleDayCount } from "@web/views/Week/hooks/grid/useVisibleDayCount";
import { goToTodayInWeek } from "@web/views/Week/hooks/shortcuts/weekShortcuts.util";
import { useDayShiftTransition } from "@web/views/Week/hooks/useDayShiftTransition";
import { useDiscardDraftOnWeekChange } from "@web/views/Week/hooks/useDiscardDraftOnWeekChange";
import { useSidebarCalendarDate } from "@web/views/Week/hooks/useSidebarCalendarDate";
import { useToday } from "@web/views/Week/hooks/useToday";
import { useWeek } from "@web/views/Week/hooks/useWeek";

export const WeekView = () => {
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  // Event details live in the sidebar, so an open form reveals the sidebar
  // even when the user keeps it collapsed; their persisted preference is
  // untouched and the panel collapses again when the form closes.
  const isEventDetailsOpen = useDraftStore(selectIsEventFormOpen);
  useSidebarShortcuts();

  const { today } = useToday();

  const { trackRef, visibleDayCount } = useVisibleDayCount();

  const weekProps = useWeek(today, visibleDayCount);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const weekTrackElementRef = useRef<HTMLDivElement | null>(null);
  const setTrackRef = useCallback(
    (node: HTMLDivElement | null) => {
      weekTrackElementRef.current = node;
      trackRef(node);
    },
    [trackRef],
  );
  useHorizontalNavigation({
    containerRef: mainRef,
    onNext: weekProps.util.incrementWeek,
    onPrevious: weekProps.util.decrementWeek,
  });
  useDayShiftTransition(
    weekTrackElementRef,
    weekProps.component.startOfView,
    weekProps.util.getLastNavigationSource(),
  );

  const { gridRefs, measurements } = useGridLayout(visibleDayCount);

  const scrollUtil = useScroll(gridRefs.mainGridRef);
  useDiscardDraftOnWeekChange(weekProps.component.week);

  const isCurrentWeek = weekProps.component.isCurrentWeek;
  const util = weekProps.util;

  const shortcutProps = {
    queryEndOfView: weekProps.query.endOfView,
    queryStartOfView: weekProps.query.startOfView,
    startOfView: weekProps.component.startOfView,
    endOfView: weekProps.component.endOfView,
    weekDays: weekProps.component.weekDays,
    util,
    scrollUtil,
  };

  const goToTodayViaCmd = useCallback(() => {
    goToTodayInWeek({
      scrollToNow: scrollUtil.scrollToNow,
      goToToday: util.goToToday,
    });
  }, [scrollUtil, util]);

  const isTrialing = useIsTrialing();
  const shortcutSections = useMemo(
    () =>
      getShortcutMenuSections({
        view: "week",
        isViewingCurrentPeriod: isCurrentWeek,
        isFormOpen: isEventDetailsOpen,
        isTrialing,
      }),
    [isCurrentWeek, isEventDetailsOpen, isTrialing],
  );

  const { calendarDate, goToDateFromSidebar } = useSidebarCalendarDate({
    goToDate: weekProps.state.goToDate,
    today,
    viewEnd: weekProps.component.endOfView,
    viewStart: weekProps.component.startOfView,
  });

  const openWelcomeGuide = useCallback(() => {
    welcomeGuideActions.open();
  }, []);

  const demoEventsRange = useMemo(
    () =>
      toDemoEventsRange(
        weekProps.component.startOfView,
        weekProps.component.endOfView,
      ),
    [weekProps.component.endOfView, weekProps.component.startOfView],
  );

  return (
    <div id="cal" className="flex h-screen w-screen overflow-hidden">
      <CommandPalette
        currentView="week"
        onGoToToday={goToTodayViaCmd}
        onShowShortcuts={viewActions.toggleShortcuts}
        onShowWelcomeGuide={openWelcomeGuide}
        placeholder={COMMAND_PALETTE_PLACEHOLDER}
      />
      <Dedication />
      <PageJumpHints />

      <Shortcuts shortcutsProps={shortcutProps}>
        <div
          id={ID_MAIN}
          ref={mainRef}
          className="flex h-screen flex-1 flex-col overflow-hidden bg-background pt-5 pr-0 pb-0 pl-8 transition-[width] duration-200 ease-out motion-reduce:transition-none"
        >
          <Header scrollUtil={scrollUtil} weekProps={weekProps} />
          <CalendarConnectionBannerGate />
          <TimezoneMismatchBannerGate />
          <DemoEventsBannerGate range={demoEventsRange} />

          <WeekGridScrollArea>
            <div
              ref={setTrackRef}
              className="@container relative flex h-full w-full min-w-47.5 flex-col [container-name:week-grid-track]"
            >
              <DayLabels
                startOfView={weekProps.component.startOfView}
                today={today}
                week={weekProps.component.week}
                weekDays={weekProps.component.weekDays}
              />

              <ContextMenuWrapper id="grid-context-menu">
                <Grid
                  gridRefs={gridRefs}
                  measurements={measurements}
                  today={today}
                  weekProps={weekProps}
                />
              </ContextMenuWrapper>
            </div>
          </WeekGridScrollArea>
        </div>
        <ContextMenuWrapper id="sidebar-context-menu">
          <Draft measurements={measurements} weekProps={weekProps} />
          <ResizableSidebarPanel isOpen={isSidebarOpen || isEventDetailsOpen}>
            <Sidebar
              calendarDate={calendarDate}
              eventDetails={<SidebarEventDetails />}
              onSelectDate={goToDateFromSidebar}
              shortcutSections={shortcutSections}
              shortcutsViewLabel="Week"
              viewEnd={weekProps.component.endOfView}
              viewStart={weekProps.component.startOfView}
            />
          </ResizableSidebarPanel>
        </ContextMenuWrapper>
      </Shortcuts>
    </div>
  );
};
