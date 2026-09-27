import type React from "react";
import { useCallback, useRef, useState } from "react";
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_DIVIDER_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@web/components/Sidebar/storage/sidebar-width.constants";
import {
  readSidebarWidth,
  writeSidebarWidth,
} from "@web/components/Sidebar/storage/sidebar-width.storage";

// The calendar area must keep at least this much room, so a drag can never
// squeeze it below a usable width.
const MAIN_MIN_WIDTH = 480;
const KEYBOARD_STEP = 16;

const clampDragWidth = (width: number, dynamicMax: number) =>
  Math.max(SIDEBAR_MIN_WIDTH, Math.min(width, SIDEBAR_MAX_WIDTH, dynamicMax));

const KEYBOARD_WIDTHS = {
  End: SIDEBAR_MAX_WIDTH,
  Enter: SIDEBAR_DEFAULT_WIDTH,
  Home: SIDEBAR_MIN_WIDTH,
} as const;

export function useResizableSidebar() {
  const [width, setWidth] = useState(readSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startWidth: number;
    dynamicMax: number;
  } | null>(null);
  // Tracked in a ref, not read from render: pointermove state updates are
  // batched asynchronously, so pointerup would otherwise persist a stale width.
  const widthRef = useRef(width);

  const applyWidth = useCallback((next: number) => {
    widthRef.current = next;
    setWidth(next);
  }, []);

  // Clamp, apply, and persist in one step — shared by keyboard and reset paths.
  const commitWidth = useCallback(
    (next: number) => {
      const clamped = clampSidebarWidth(next);
      applyWidth(clamped);
      writeSidebarWidth(clamped);
    },
    [applyWidth],
  );

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // The sidebar is pinned to the right edge, so the room it can grow into is
    // the viewport minus the divider and the calendar's minimum width. Measured
    // once here since the viewport is stable for the duration of a drag.
    const dynamicMax =
      window.innerWidth - SIDEBAR_DIVIDER_WIDTH - MAIN_MIN_WIDTH;
    dragRef.current = {
      startX: e.clientX,
      startWidth: widthRef.current,
      dynamicMax,
    };
    setIsResizing(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;

      // The sidebar is pinned to the right edge, so dragging the divider
      // toward the left (a decreasing clientX) grows it.
      const next = drag.startWidth + (drag.startX - e.clientX);
      applyWidth(clampDragWidth(next, drag.dynamicMax));
    },
    [applyWidth],
  );

  const endResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsResizing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    writeSidebarWidth(widthRef.current);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // The divider is left of the sidebar, so ArrowLeft (moving the
      // splitter toward the calendar) grows it and ArrowRight shrinks it.
      const direction =
        e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
      const next =
        direction !== 0
          ? widthRef.current + direction * KEYBOARD_STEP
          : KEYBOARD_WIDTHS[e.key as keyof typeof KEYBOARD_WIDTHS];
      if (next === undefined) return;
      e.preventDefault();
      commitWidth(next);
    },
    [commitWidth],
  );

  const onDoubleClick = useCallback(() => {
    commitWidth(SIDEBAR_DEFAULT_WIDTH);
  }, [commitWidth]);

  return {
    width,
    isResizing,
    dividerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endResize,
      onPointerCancel: endResize,
      onKeyDown,
      onDoubleClick,
    },
  };
}
