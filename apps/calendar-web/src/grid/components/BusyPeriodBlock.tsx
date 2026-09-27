import { type CSSProperties } from "react";
import { ZIndex } from "@web/common/constants/web.constants";
import { type EventPosition } from "@web/grid/types/grid.types";

interface BusyPeriodBlockProps {
  ariaLabel: string;
  position: EventPosition;
}

/**
 * Inert decoration only (packet 08 phase 4; A7): a freeBusyReader calendar
 * only ever exposes aggregate free/busy ranges, never event details, so this
 * block carries no title, no click/keyboard handlers, and no context menu -
 * there is nothing here for the drag/resize engine or any event action to
 * attach to. `pointer-events-none` backs that structurally (clicks/right-
 * clicks pass through to whatever's underneath) rather than relying on the
 * absence of handlers alone. `role="img"` gives it a single accessible name
 * (mirrors AsciiPortrait.tsx) without exposing
 * it as an interactive control - never `role="button"`.
 */
export const BusyPeriodBlock = ({
  ariaLabel,
  position,
}: BusyPeriodBlockProps) => {
  const style: CSSProperties = {
    backgroundImage:
      "repeating-linear-gradient(135deg, var(--color-surface-overlay) 0px, var(--color-surface-overlay) 4px, transparent 4px, transparent 9px)",
    height: position.height || 0,
    left: position.left,
    top: position.top,
    width: position.width || 0,
    zIndex: position.zIndex ?? ZIndex.BUSY_PERIOD,
  };

  return (
    <div
      aria-label={ariaLabel}
      className="pointer-events-none absolute overflow-hidden rounded-xs border border-border bg-surface-overlay"
      role="img"
      style={style}
    />
  );
};
