import {
  eventEdgeFocusShadow,
  eventFocusColor,
} from "@web/grid/components/calendar-accent.util";
import {
  selectEdgeForEvent,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";

export type GridEventEdgeFocus = {
  focusedEdge: "startDate" | "endDate" | null;
  /** Resolved CSS color for `--event-focus-color`. */
  focusColorCss: string;
  /** Outer edge line, or undefined when no edge is focused. */
  edgeFocusShadow: string | undefined;
};

/**
 * Edge-focus chrome for one grid event card. The axis is the only difference
 * between the timed and all-day cards: timed cards draw the line above and
 * below, all-day cards to the left and right.
 */
export function useGridEventEdgeFocus(
  eventId: string | null | undefined,
  focusColor: string | null | undefined,
  axis: "horizontal" | "vertical",
): GridEventEdgeFocus {
  const focusedEdge = useEdgeFocusStore(selectEdgeForEvent(eventId));
  const focusColorCss = eventFocusColor(focusColor);

  return {
    focusedEdge,
    focusColorCss,
    edgeFocusShadow: focusedEdge
      ? eventEdgeFocusShadow(focusedEdge, axis, focusColorCss)
      : undefined,
  };
}
