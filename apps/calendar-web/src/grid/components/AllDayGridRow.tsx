import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUpIcon } from "@phosphor-icons/react/dist/csr/CaretUp";
import {
  type FC,
  type FocusEvent,
  type ReactNode,
  type RefCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { PH_NO_RAGECLICK_CLASS } from "@web/auth/posthog/posthog-calendar-grid.util";
import {
  ID_ALLDAY_COLUMNS,
  ID_GRID_ALLDAY_ROW,
} from "@web/common/constants/web.constants";
import { type CSSVariables } from "@web/common/styles/css.types";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import {
  setAllDayRowCollapsible,
  setAllDayRowExpanded,
  useAllDayRowExpanded,
} from "@web/grid/all-day-row/allDayRowCollapse.store";
import {
  EVENT_ALLDAY_GAP,
  EVENT_ALLDAY_HEIGHT,
  EVENT_ALLDAY_ROW_HEIGHT,
  EVENT_WIDTH_MINIMUM,
} from "@web/grid/grid.constants";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { allDayColumnTintStyle } from "@web/grid/utils/allDayColumnTint.util";
import {
  ALL_DAY_ROW_COLLAPSED_VISIBLE_LANES,
  allDayRowHeightPx,
  allDayRowStackHeightPx,
  isAllDayRowCollapsible,
} from "@web/grid/utils/allDayRowHeight.util";
import {
  selectEventJumpActiveDayKeys,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";

/** Marks row chrome (toggle, "+N more") that is not an empty all-day slot. */
export const ALL_DAY_ROW_CONTROL_ATTRIBUTE = "data-allday-row-control";
export const ALL_DAY_ROW_TOGGLE_ID = "allday-row-toggle";
const ALL_DAY_ROW_EVENTS_CLIP_ID = "allday-row-events-clip";

const TOGGLE_SHORTCUT = APP_SHORTCUT_BINDINGS.navToggleAllDay.keycaps;
const CONTROL_FOCUS_CLASS =
  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0";

interface AllDayRowProps {
  allDayColumnsRef: RefCallback<HTMLDivElement>;
  allDayRowRef: RefCallback<HTMLElement>;
  columnsId?: string;
  eventsLayer: ReactNode;
  /** Per visible column: all-day events below the collapsed lanes. */
  hiddenCountsByColumn?: readonly number[];
  /** Keep every lane visible (e.g. an all-day draft sits in a hidden lane). */
  forceExpanded?: boolean;
  highlightedColumnKey?: string | null;
  rowsCount?: number;
  rowId?: string;
  visibleDates: GridVisibleDate[];
}

const clippedLanesHeightPx =
  EVENT_ALLDAY_GAP +
  ALL_DAY_ROW_COLLAPSED_VISIBLE_LANES * EVENT_ALLDAY_ROW_HEIGHT;

export const AllDayGridRow: FC<AllDayRowProps> = ({
  allDayColumnsRef,
  allDayRowRef,
  columnsId = ID_ALLDAY_COLUMNS,
  eventsLayer,
  hiddenCountsByColumn = [],
  forceExpanded = false,
  highlightedColumnKey = null,
  rowsCount = 0,
  rowId = ID_GRID_ALLDAY_ROW,
  visibleDates,
}) => {
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);
  const marginLeft = useGridMarginLeft();
  const storedExpanded = useAllDayRowExpanded();
  const [focusPeek, setFocusPeek] = useState(false);
  const clipRef = useRef<HTMLDivElement>(null);

  const collapsible = isAllDayRowCollapsible(rowsCount);
  const expanded = storedExpanded || forceExpanded || focusPeek;
  const collapsed = collapsible && !expanded;
  const heightPx = allDayRowHeightPx(rowsCount, !collapsed);

  useEffect(() => {
    setAllDayRowCollapsible(collapsible);
    return () => setAllDayRowCollapsible(false);
  }, [collapsible]);

  // Keyboard focus on a chip in a folded lane opens the row until focus leaves,
  // so Tab and jump labels never land on something the user cannot see.
  const onFocusCapture = (event: FocusEvent<HTMLElement>) => {
    if (!collapsed || !clipRef.current) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!clipRef.current.contains(target)) return;
    const clipTop = clipRef.current.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    if (targetTop - clipTop >= clippedLanesHeightPx - EVENT_ALLDAY_GAP) {
      setFocusPeek(true);
    }
  };
  const onBlurCapture = (event: FocusEvent<HTMLElement>) => {
    if (!focusPeek) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setFocusPeek(false);
  };

  const toggleLabel = storedExpanded
    ? "Collapse all-day row"
    : "Expand all-day row";

  return (
    <section
      className={`relative flex w-full shrink-0 items-start bg-background ${PH_NO_RAGECLICK_CLASS} transition-[height] duration-200 ease-out motion-reduce:transition-none`}
      aria-label="All-day events"
      data-allday-collapsed={collapsible ? String(collapsed) : undefined}
      id={rowId}
      onBlurCapture={onBlurCapture}
      onFocusCapture={onFocusCapture}
      ref={allDayRowRef}
      style={{
        height: `${heightPx}px`,
        minHeight: `${collapsed ? heightPx : allDayRowStackHeightPx(rowsCount)}px`,
      }}
    >
      <div
        className="absolute top-0 left-[var(--calendar-grid-margin-left)] grid h-full w-[calc(100%_-_var(--calendar-grid-margin-left))] grid-cols-[repeat(var(--calendar-column-count),minmax(var(--calendar-column-min-width),1fr))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:bg-border before:content-['']"
        id={columnsId}
        ref={allDayColumnsRef}
        style={
          {
            "--calendar-column-count": visibleDates.length,
            "--calendar-column-min-width": `${EVENT_WIDTH_MINIMUM}px`,
            "--calendar-grid-margin-left": `${marginLeft}px`,
          } as CSSVariables
        }
      >
        <table className="contents">
          <thead className="contents">
            <tr className="contents">
              {visibleDates.map(
                ({ date, key, surfaceLabel, allDayTintColor }) => {
                  const dayKey = date.format(YEAR_MONTH_DAY_FORMAT);
                  const isJumpDay = activeDayKeys.includes(dayKey);
                  const isFocusedColumn = key === highlightedColumnKey;
                  const tintStyle = allDayColumnTintStyle(
                    allDayTintColor,
                    isJumpDay || isFocusedColumn,
                  );
                  return (
                    <th
                      className="relative box-border block h-full min-w-[var(--calendar-column-min-width)] border-border border-l transition-colors duration-150 data-[focused-column=true]:bg-accent/10 data-[jump-day=true]:bg-accent/10 motion-reduce:transition-none"
                      data-all-day-tint={tintStyle ? "true" : undefined}
                      data-focused-column={isFocusedColumn ? "true" : undefined}
                      data-jump-day={isJumpDay ? "true" : undefined}
                      data-grid-date={dayKey}
                      aria-label={
                        surfaceLabel ?? date.format("dddd, MMMM D, YYYY")
                      }
                      key={key}
                      scope="col"
                      style={tintStyle}
                    />
                  );
                },
              )}
            </tr>
          </thead>
        </table>
      </div>
      <div
        // Flex like the section, so a margin-offset w-full events layer
        // shrinks to fit instead of overflowing the week scroller.
        className="relative flex h-full w-full min-w-0 items-start"
        id={ALL_DAY_ROW_EVENTS_CLIP_ID}
        ref={clipRef}
        style={
          collapsed
            ? { height: `${clippedLanesHeightPx}px`, overflowY: "clip" }
            : undefined
        }
      >
        {eventsLayer}
      </div>
      {collapsed ? (
        <div
          className="pointer-events-none absolute grid grid-cols-[repeat(var(--calendar-column-count),minmax(var(--calendar-column-min-width),1fr))]"
          data-testid="allday-row-more"
          style={
            {
              "--calendar-column-count": visibleDates.length,
              "--calendar-column-min-width": `${EVENT_WIDTH_MINIMUM}px`,
              height: `${EVENT_ALLDAY_HEIGHT}px`,
              left: `${marginLeft}px`,
              right: 0,
              top: `${clippedLanesHeightPx}px`,
            } as CSSVariables
          }
        >
          {visibleDates.map(({ key }, index) => {
            const hidden = hiddenCountsByColumn[index] ?? 0;
            return (
              <div className="min-w-0 px-1" key={key}>
                {hidden > 0 ? (
                  <button
                    {...{ [ALL_DAY_ROW_CONTROL_ATTRIBUTE]: "" }}
                    aria-controls={rowId}
                    className={`pointer-events-auto h-full max-w-full truncate rounded px-1 text-left text-text-muted text-xs hover:bg-surface-hover hover:text-text-primary ${CONTROL_FOCUS_CLASS}`}
                    onClick={() => setAllDayRowExpanded(true)}
                    type="button"
                  >
                    +{hidden} more
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {collapsible ? (
        <div
          className="absolute bottom-0 left-0 flex justify-center"
          style={{
            paddingBottom: `${EVENT_ALLDAY_GAP}px`,
            width: `${marginLeft}px`,
          }}
        >
          <TooltipWrapper
            asChild
            description={toggleLabel}
            onClick={() => setAllDayRowExpanded(!storedExpanded)}
            placement="right"
            shortcut={[...TOGGLE_SHORTCUT]}
            shortcutId="nav-toggle-allday"
          >
            <button
              {...{ [ALL_DAY_ROW_CONTROL_ATTRIBUTE]: "" }}
              aria-controls={rowId}
              aria-expanded={!collapsed}
              aria-label={toggleLabel}
              className={`flex items-center justify-center rounded text-text-muted hover:bg-surface-hover hover:text-text-primary ${CONTROL_FOCUS_CLASS}`}
              id={ALL_DAY_ROW_TOGGLE_ID}
              style={{
                height: `${EVENT_ALLDAY_HEIGHT}px`,
                width: `${EVENT_ALLDAY_HEIGHT}px`,
              }}
              type="button"
            >
              {storedExpanded ? (
                <CaretUpIcon aria-hidden="true" size={14} />
              ) : (
                <CaretDownIcon aria-hidden="true" size={14} />
              )}
            </button>
          </TooltipWrapper>
        </div>
      ) : null}
    </section>
  );
};
