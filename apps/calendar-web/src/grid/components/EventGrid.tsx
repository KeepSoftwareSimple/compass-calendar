import { type FC, type ReactNode } from "react";
import { type Dayjs } from "@core/util/date/dayjs";
import { ZIndex } from "@web/common/constants/web.constants";
import { AbsoluteOverflowLoader } from "@web/components/AbsoluteOverflowLoader/AbsoluteOverflowLoader";
import { PixelPirateScouting } from "@web/components/WelcomeModal/PixelPirateScouting";
import {
  type GridRefs,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";
import { AllDayGridRow } from "./AllDayGridRow";
import { EventGridRetryOverlay } from "./EventGridRetryOverlay";
import { TimedGrid } from "./TimedGrid";

export interface EventGridProps {
  allDayEventsLayer: ReactNode;
  allDayGridOffsetTopPx?: number;
  allDayRowsCount?: number;
  gridRefs: GridRefs;
  /** First load, or refetch after a failed load (Retry). */
  isLoadingEvents?: boolean;
  /** Failed fetch with nothing reliable to show. */
  isErrorEvents?: boolean;
  /**
   * Google import is in progress and the visible range has no events yet —
   * show a non-blocking scouting indicator instead of a blank grid.
   */
  isImportingEmpty?: boolean;
  /**
   * The first Google import failed (or stalled into attention) and the visible
   * range is still empty — show an error with Retry instead of a blank grid.
   */
  isImportFailed?: boolean;
  onRetryEvents?: () => void;
  onRetryImport?: () => void;
  timedEventsLayer: ReactNode;
  today: Dayjs;
  visibleDates: GridVisibleDate[];
  /** Day-view calendar column currently focused via hold-Mod jump. */
  highlightedColumnKey?: string | null;
}

export const EventGrid: FC<EventGridProps> = ({
  allDayEventsLayer,
  allDayGridOffsetTopPx = 0,
  allDayRowsCount = 0,
  gridRefs,
  isLoadingEvents = false,
  isErrorEvents = false,
  isImportingEmpty = false,
  isImportFailed = false,
  onRetryEvents,
  onRetryImport,
  timedEventsLayer,
  today,
  visibleDates,
  highlightedColumnKey = null,
}) => (
  <div className="relative flex min-h-0 w-full flex-1 flex-col">
    <AllDayGridRow
      allDayColumnsRef={gridRefs.allDayRef}
      allDayRowRef={gridRefs.allDayRowRef}
      eventsLayer={allDayEventsLayer}
      gridOffsetTopPx={allDayGridOffsetTopPx}
      highlightedColumnKey={highlightedColumnKey}
      rowsCount={allDayRowsCount}
      visibleDates={visibleDates}
    />
    <TimedGrid
      eventsLayer={timedEventsLayer}
      highlightedColumnKey={highlightedColumnKey}
      timedColumnsRef={gridRefs.timedColumnsElementRef}
      timedGridRef={gridRefs.mainGridElementRef}
      today={today}
      visibleDates={visibleDates}
    />
    {/* Sibling overlay, not an outline on TimedGrid itself, so the ring isn't clipped by overflow-y-auto and includes the all-day row above. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden outline outline-1 outline-[var(--accent)] peer-focus-visible:block"
      data-testid="grid-focus-indicator"
    />
    {isLoadingEvents && (
      // First load: keep grid chrome (hour lines, columns) visible under a
      // small non-blocking spinner — no opaque fill or blur. Retry after
      // error stays opaque and blocks the grid so Retry cannot click through.
      <AbsoluteOverflowLoader
        aria-label="Loading events"
        className={
          isErrorEvents
            ? "bg-background [&>div]:my-0"
            : "pointer-events-none backdrop-blur-none [&>div]:my-0 [&>div]:h-10 [&>div]:w-10 [&>div]:border-2"
        }
        role="status"
        style={{ zIndex: ZIndex.MAX }}
      />
    )}
    {isImportingEmpty &&
      !isLoadingEvents &&
      !isErrorEvents &&
      !isImportFailed && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-4"
          style={{ zIndex: ZIndex.MAX }}
        >
          <div aria-hidden="true">
            <PixelPirateScouting className="h-16 w-16" />
          </div>
          <p className="text-sm text-text-muted" role="status">
            Adding your calendar…
          </p>
        </div>
      )}
    {isImportFailed && !isLoadingEvents && !isErrorEvents && (
      <EventGridRetryOverlay
        message="Couldn't add your calendar."
        onRetry={onRetryImport}
      />
    )}
    {isErrorEvents && !isLoadingEvents && (
      <EventGridRetryOverlay
        message="Couldn't load events."
        onRetry={onRetryEvents}
      />
    )}
  </div>
);

/** First load, or a Retry refetch after failure — both should show the loader. */
export function isEventGridLoading(
  isPending: boolean,
  isError: boolean,
  isFetching: boolean,
): boolean {
  return isPending || (isError && isFetching);
}
