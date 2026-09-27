import { ZIndex } from "@web/common/constants/web.constants";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { getBusyPeriodPosition } from "@web/grid/layout/event.position";
import {
  type EventPosition,
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";
import { type QuickTimeSlot } from "@web/shortcuts/quick-time/quick-time.util";
import {
  selectEventJumpActive,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";

const ID_QUICK_TIME_SLOTS = "quickTimeSlots";

interface Props {
  /** Day view pins every slot to the target calendar's column. */
  columnIndex?: number;
  measurements: GridMeasurements;
  slots: QuickTimeSlot[];
  visibleDates: GridVisibleDate[];
}

/**
 * Placeholder blocks in the open hours of the quick-time target day, shown
 * while event-jump mode is on so `h` reveals where a typed time would land as
 * well as where the existing events are.
 *
 * Inert decoration in the same sense as BusyPeriodBlock: no handlers, nothing
 * for the drag/resize engine to grab, and ZIndex.BUSY_PERIOD so it can never
 * paint over a real card. The chips are aria-hidden because they are a visual
 * affordance for a keystroke - the jump indicator's live region carries the
 * spoken story.
 */
export const QuickTimeSlots = ({
  columnIndex,
  measurements,
  slots,
  visibleDates,
}: Props) => {
  const isActive = useEventJumpStore(selectEventJumpActive);

  if (!isActive || slots.length === 0) return null;

  return (
    <div id={ID_QUICK_TIME_SLOTS}>
      {slots.map((slot) => {
        const position = getBusyPeriodPosition(slot, {
          columnIndex,
          measurements,
          visibleDates,
        });
        if (position.width <= 0 || position.height <= 0) return null;

        return (
          <QuickTimeSlotBlock
            key={slot.sequence}
            position={position}
            sequence={slot.sequence}
          />
        );
      })}
    </div>
  );
};

const QuickTimeSlotBlock = ({
  position,
  sequence,
}: {
  position: EventPosition;
  sequence: string;
}) => (
  <div
    aria-hidden
    className="pointer-events-none absolute flex items-start justify-end overflow-hidden rounded-xs border border-border-strong border-dashed p-0.5"
    data-quick-time-slot={sequence}
    style={{
      height: position.height,
      left: position.left,
      top: position.top,
      width: position.width,
      zIndex: position.zIndex ?? ZIndex.BUSY_PERIOD,
    }}
  >
    <ShortcutHint>{sequence}</ShortcutHint>
  </div>
);
