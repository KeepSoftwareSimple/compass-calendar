import { lazyRouteComponent } from "@tanstack/react-router";
import { type HTMLAttributes, type ReactNode, Suspense } from "react";
import { type Dayjs } from "@core/util/date/dayjs";
import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
import { CalendarList } from "./CalendarList/CalendarList";
import { MeetingPageNudge } from "./MeetingPageNudge/MeetingPageNudge";
import { SidebarShell } from "./SidebarShell";
import { TasksRemovalNotice } from "./TasksRemovalNotice/TasksRemovalNotice";
import { UpNextCard } from "./UpNextCard/UpNextCard";

// Lazy: MonthPicker is the only boot-path import of react-datepicker, so
// splitting it keeps that library out of the entry chunk (the event form
// reuses the same split chunk). The fallback holds the picker's approximate
// height so the calendar list doesn't jump when the chunk lands.
const MonthPicker = lazyRouteComponent(
  () => import("./MonthPicker/MonthPicker"),
  "MonthPicker",
);

export interface SidebarProps extends HTMLAttributes<HTMLDivElement> {
  calendarDate: Dayjs;
  /**
   * The view's event-details form. Shown in place of the sidebar's normal
   * body while the draft store says a grid event form is open, so event
   * editing always happens in the sidebar.
   */
  eventDetails?: ReactNode;
  monthsShown?: number;
  onSelectDate: (date: Dayjs) => void;
  shortcutSections: ShortcutOverlaySection[];
  shortcutsViewLabel?: string;
  viewEnd: Dayjs;
  viewStart: Dayjs;
}

export function Sidebar({
  calendarDate,
  eventDetails,
  monthsShown = 1,
  onSelectDate,
  shortcutSections,
  shortcutsViewLabel,
  viewEnd,
  viewStart,
  ...props
}: SidebarProps) {
  const isEventFormOpen = useDraftStore(selectIsEventFormOpen);
  const showEventDetails = Boolean(eventDetails) && isEventFormOpen;

  return (
    <SidebarShell
      {...props}
      shortcutSections={shortcutSections}
      shortcutsViewLabel={shortcutsViewLabel}
    >
      {showEventDetails ? (
        // Scrolling and horizontal padding live inside the event form so
        // its pinned save footer can span the sidebar's full width.
        <section
          aria-label="Event details"
          className="flex min-h-0 flex-1 flex-col"
        >
          {eventDetails}
        </section>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-5 [scrollbar-gutter:stable]">
          <Suspense fallback={<div aria-hidden className="h-63" />}>
            <MonthPicker
              monthsShown={monthsShown}
              onSelectDate={onSelectDate}
              selectedDate={calendarDate}
              viewEnd={viewEnd}
              viewStart={viewStart}
            />
          </Suspense>
          <UpNextCard />
          <CalendarList />
          <MeetingPageNudge />
          <TasksRemovalNotice />
        </div>
      )}
    </SidebarShell>
  );
}
