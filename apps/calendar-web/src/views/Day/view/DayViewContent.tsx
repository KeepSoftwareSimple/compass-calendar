import { memo, useCallback, useMemo, useRef } from "react";
import { useIsTrialing } from "@web/billing/useIsTrialing";
import { ID_MAIN } from "@web/common/constants/web.constants";
import { useHorizontalNavigation } from "@web/common/hooks/useHorizontalNavigation";
import { emitViewCommand } from "@web/common/utils/dom/view-command-bus";
import { CalendarConnectionBannerGate } from "@web/components/CalendarConnectionBanner/CalendarConnectionBannerGate";
import { CommandPalette } from "@web/components/CommandPalette/CommandPalette";
import { COMMAND_PALETTE_PLACEHOLDER } from "@web/components/CommandPalette/more.cmd.constants";
import { DemoEventsBannerGate } from "@web/components/DemoEventsBanner/DemoEventsBannerGate";
import { SidebarEventDetails } from "@web/components/Sidebar/EventDetails/SidebarEventDetails";
import { ResizableSidebarPanel } from "@web/components/Sidebar/ResizableSidebarPanel";
import { Sidebar } from "@web/components/Sidebar/Sidebar";
import { useFocusSidebarShortcut } from "@web/components/Sidebar/useFocusSidebarShortcut";
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
import { useCalendarViewShortcuts } from "@web/grid/shortcuts/useCalendarViewShortcuts";
import { getShortcutMenuSections } from "@web/shortcuts/shortcuts.registry";
import { TimezoneMismatchBannerGate } from "@web/timezone/TimezoneMismatchBannerGate";
import { DayCalendarGrid } from "@web/views/Day/components/Calendar/DayCalendarGrid";
import { Header } from "@web/views/Day/components/Header/Header";
import { useDayEvents } from "@web/views/Day/hooks/events/useDayEvents";
import { useDateInView } from "@web/views/Day/hooks/navigation/useDateInView";
import { useDateNavigation } from "@web/views/Day/hooks/navigation/useDateNavigation";
import { focusFirstDayCalendarEvent } from "@web/views/Day/interaction/day-event.focus";
import { Dedication } from "@web/views/Week/components/Dedication/Dedication";
import { useToday } from "@web/views/Week/hooks/useToday";

export const DayViewContent = memo(() => {
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  // Event details live in the sidebar, so an open form reveals the sidebar
  // even when the user keeps it collapsed; their persisted preference is
  // untouched and the panel collapses again when the form closes.
  const isEventDetailsOpen = useDraftStore(selectIsEventFormOpen);
  const mainRef = useRef<HTMLDivElement | null>(null);

  const dateInView = useDateInView();
  const { today } = useToday();
  const isViewingToday = dateInView.isSame(today, "day");

  const {
    navigateToDate,
    navigateToNextDay,
    navigateToPreviousDay,
    navigateToToday,
  } = useDateNavigation();
  useHorizontalNavigation({
    containerRef: mainRef,
    onNext: navigateToNextDay,
    onPrevious: navigateToPreviousDay,
  });
  useDayEvents(dateInView);

  useFocusSidebarShortcut();
  useSidebarShortcuts();

  const isTrialing = useIsTrialing();
  const shortcutSections = useMemo(
    () =>
      getShortcutMenuSections({
        view: "day",
        isViewingCurrentPeriod: isViewingToday,
        isFormOpen: isEventDetailsOpen,
        isTrialing,
      }),
    [isEventDetailsOpen, isTrialing, isViewingToday],
  );

  const handleGoToToday = useCallback(() => {
    const isViewingToday = dateInView.isSame(today, "day");

    if (isViewingToday) {
      emitViewCommand("SCROLL_TO_NOW_LINE");
    } else {
      navigateToToday();
    }
  }, [dateInView, navigateToToday, today]);

  const handleCreateTimedEvent = useCallback(() => {
    emitViewCommand("CREATE_TIMED_DRAFT");
  }, []);

  const handleCreateAllDayEvent = useCallback(() => {
    emitViewCommand("CREATE_ALLDAY_DRAFT");
  }, []);

  useCalendarViewShortcuts({
    onCreateTimedEvent: handleCreateTimedEvent,
    onCreateAllDayEvent: handleCreateAllDayEvent,
    onFocusCalendar: focusFirstDayCalendarEvent,
    onNextPeriod: navigateToNextDay,
    onPrevPeriod: navigateToPreviousDay,
    onGoToToday: handleGoToToday,
  });

  const openWelcomeGuide = useCallback(() => {
    welcomeGuideActions.open();
  }, []);

  const demoEventsRange = useMemo(
    () => toDemoEventsRange(dateInView, dateInView),
    [dateInView],
  );

  return (
    <div id="day" className="flex h-screen w-screen overflow-hidden">
      <CommandPalette
        currentView="day"
        onGoToToday={handleGoToToday}
        onShowShortcuts={viewActions.toggleShortcuts}
        onShowWelcomeGuide={openWelcomeGuide}
        placeholder={COMMAND_PALETTE_PLACEHOLDER}
      />
      <Dedication />

      <div
        id={ID_MAIN}
        ref={mainRef}
        className="flex h-screen flex-1 flex-col overflow-hidden bg-background pt-5 pl-8 transition-[width] duration-200 ease-out motion-reduce:transition-none"
      >
        <Header />
        <CalendarConnectionBannerGate />
        <TimezoneMismatchBannerGate />
        <DemoEventsBannerGate range={demoEventsRange} />

        <div className="flex w-full flex-1 overflow-hidden">
          <DayCalendarGrid />
        </div>
      </div>

      <ResizableSidebarPanel isOpen={isSidebarOpen || isEventDetailsOpen}>
        <Sidebar
          calendarDate={dateInView}
          eventDetails={<SidebarEventDetails />}
          onSelectDate={navigateToDate}
          shortcutSections={shortcutSections}
          shortcutsViewLabel="Day"
          viewEnd={dateInView}
          viewStart={dateInView}
        />
      </ResizableSidebarPanel>
    </div>
  );
});

DayViewContent.displayName = "DayViewContent";
