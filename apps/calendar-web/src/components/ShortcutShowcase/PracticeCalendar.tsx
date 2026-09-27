import { type FC } from "react";
import { HOURS_AM_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import { theme } from "@web/common/styles/theme";
import { useEventPalette } from "@web/common/styles/theme.util";
import { type GameSlot } from "@web/components/ShortcutShowcase/game.tasks";
import {
  formatGridHour,
  gridOffsetPercent,
  percentBlockStyle,
} from "@web/components/ShortcutShowcase/game-grid.util";
import {
  type PracticeEventBlock,
  type PracticeState,
  SHOWCASE_DAY_COUNT,
  SHOWCASE_GRID_END_HOUR,
  SHOWCASE_GRID_START_HOUR,
} from "@web/components/ShortcutShowcase/practice.state";

const DAY_LABELS = ["Mon", "Tue", "Wed"];
const GRID_START_MIN = SHOWCASE_GRID_START_HOUR * 60;
const TOTAL_MIN = (SHOWCASE_GRID_END_HOUR - SHOWCASE_GRID_START_HOUR) * 60;

/** The lock flash retriggers by remounting the block with a new seq. */
export type PracticeFlash = { eventId: string; seq: number };

const formatTime = (minutes: number) =>
  dayjs().startOf("day").add(minutes, "minute").format(HOURS_AM_FORMAT);

const slotGeometry = (startMin: number, endMin: number) =>
  percentBlockStyle(startMin, endMin - startMin, GRID_START_MIN, TOTAL_MIN);

const PracticeBlock: FC<{
  block: PracticeEventBlock;
  state: PracticeState;
  flashing: boolean;
  pulsing: boolean;
  jumpLetter?: string;
  jumpLetterActive?: boolean;
}> = ({ block, state, flashing, pulsing, jumpLetter, jumpLetterActive }) => {
  const { base } = useEventPalette(block.color);
  const contentColor = theme.getContrastText(base);
  const isFocused = state.focusedId === block.id;
  const isPlacing = state.placingId === block.id;
  const focusedEdge = isFocused ? state.edge : null;
  const height = ((block.endMin - block.startMin) / TOTAL_MIN) * 100;

  // With an edge focused, the edge bar carries the focus: the whole-block
  // ring dims so a thick border cannot be mistaken for the focused edge.
  const focusShadow = isFocused
    ? focusedEdge
      ? "0 0 0 1px color-mix(in srgb, var(--text) 35%, transparent)"
      : "0 0 0 1px var(--background), 0 0 0 3px color-mix(in srgb, var(--text) 70%, transparent)"
    : "";
  const edgeFocusShadow =
    focusedEdge === "start"
      ? "0 -4px 0 0 var(--color-accent)"
      : focusedEdge === "end"
        ? "0 4px 0 0 var(--color-accent)"
        : "";
  const edgeFocusAttr =
    focusedEdge === "start"
      ? "startDate"
      : focusedEdge === "end"
        ? "endDate"
        : undefined;

  return (
    <div
      className={`absolute inset-x-1 rounded-md px-2 py-1 text-xs transition-all duration-200 ${
        flashing ? "c-game-lock-flash" : ""
      } ${pulsing && isFocused && !focusedEdge ? "c-game-focus-pulse" : ""} ${
        isPlacing ? "opacity-90" : ""
      }`}
      data-practice-event-id={block.id}
      data-practice-focused={isFocused ? "" : undefined}
      data-practice-placing={isPlacing ? "" : undefined}
      data-edge-focus={edgeFocusAttr}
      style={{
        ...slotGeometry(block.startMin, block.endMin),
        backgroundColor: base,
        color: contentColor,
        boxShadow: [focusShadow, edgeFocusShadow].filter(Boolean).join(", "),
      }}
    >
      <div className="min-w-0 truncate font-medium">
        {block.title || "New event"}
      </div>
      {height > 8 && (
        <div className="truncate opacity-80">
          {formatTime(block.startMin)} to {formatTime(block.endMin)}
        </div>
      )}
      {jumpLetter && (
        <span
          aria-hidden
          className={`c-keycap absolute top-1 right-1 ${
            jumpLetterActive ? "c-keycap-next" : ""
          }`}
          data-practice-jump-letter={jumpLetter}
        >
          {jumpLetter.toUpperCase()}
        </span>
      )}
    </div>
  );
};

/**
 * Static month-picker chrome so the sandbox reads like the real sidebar.
 * Not interactive: it only exists so the stage matches the calendar the
 * player graduates into.
 */
const PracticeSidebar: FC = () => {
  const monthLabel = dayjs().format("MMMM");

  return (
    <div
      aria-hidden
      className="relative flex w-28 shrink-0 flex-col gap-3 pl-3"
      data-practice-jump="sidebar"
    >
      <div className="font-medium text-text-muted text-xs">{monthLabel}</div>
      <div className="h-20 rounded-md bg-surface-overlay" />
      <div className="rounded-md bg-surface-overlay px-2 py-1.5 text-[10px] text-text-muted">
        Up next
      </div>
    </div>
  );
};

/**
 * The showcase's fake grid: day columns, hour lines, time-positioned
 * blocks, and a right-hand sidebar matching the real calendar. Deliberately
 * not the real TimedGrid, which drags in stores and scroll plumbing the
 * game does not need; geometry is plain percentage math off the practice
 * state. The dashed target slot is the game's "ghost piece".
 */
export const PracticeCalendar: FC<{
  state: PracticeState;
  targetSlot?: GameSlot | null;
  flash?: PracticeFlash | null;
  /** Pulse the focused block so an auto-focused task target stands out. */
  pulseFocused?: boolean;
  /** Jump-letter chips by event id, shown while the H reveal is active. */
  jumpLetters?: Record<string, string> | null;
  /** The event whose chip pulses as the exact next key to press. */
  jumpTargetId?: string | null;
}> = ({
  state,
  targetSlot = null,
  flash = null,
  pulseFocused = false,
  jumpLetters = null,
  jumpTargetId = null,
}) => {
  const hours: number[] = [];
  for (let h = SHOWCASE_GRID_START_HOUR; h < SHOWCASE_GRID_END_HOUR; h += 1) {
    hours.push(h);
  }

  return (
    <div
      className="relative flex h-full min-h-0 w-full select-none"
      data-practice-jump="calendar"
    >
      {/* Time column */}
      <div className="flex w-14 shrink-0 flex-col border-border border-r pr-2 text-right">
        <div className="h-7" />
        <div className="relative flex-1">
          {hours.map((hour) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-[10px] text-text-muted"
              style={{
                top: gridOffsetPercent(hour * 60, GRID_START_MIN, TOTAL_MIN),
              }}
            >
              {formatGridHour(hour)}
            </span>
          ))}
        </div>
      </div>

      {/* Day columns */}
      {Array.from({ length: SHOWCASE_DAY_COUNT }, (_, dayIndex) => (
        <div
          key={DAY_LABELS[dayIndex]}
          className="flex min-w-0 flex-1 flex-col border-border border-r"
        >
          <div className="flex h-7 items-center justify-center font-medium text-text-muted text-xs">
            {DAY_LABELS[dayIndex]}
          </div>
          <div className="relative flex-1">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-border/60 border-t"
                style={{
                  top: gridOffsetPercent(hour * 60, GRID_START_MIN, TOTAL_MIN),
                }}
              />
            ))}
            {targetSlot && targetSlot.dayIndex === dayIndex && (
              <div
                aria-hidden
                className="absolute inset-x-1 rounded-md border-2 border-border-strong border-dashed bg-surface-overlay/40"
                data-practice-target-slot=""
                style={slotGeometry(targetSlot.startMin, targetSlot.endMin)}
              />
            )}
            {state.events
              .filter((block) => block.dayIndex === dayIndex)
              .map((block) => (
                <PracticeBlock
                  key={
                    flash?.eventId === block.id
                      ? `${block.id}-flash-${flash.seq}`
                      : block.id
                  }
                  block={block}
                  state={state}
                  flashing={flash?.eventId === block.id}
                  pulsing={pulseFocused}
                  jumpLetter={jumpLetters?.[block.id]}
                  jumpLetterActive={block.id === jumpTargetId}
                />
              ))}
          </div>
        </div>
      ))}

      <PracticeSidebar />
    </div>
  );
};
