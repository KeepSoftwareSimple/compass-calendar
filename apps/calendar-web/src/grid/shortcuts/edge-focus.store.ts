import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { type EventEdge } from "@web/common/utils/event/event-nudge.util";

export type EdgeFocusState = {
  eventId: string | null;
  edge: EventEdge | null;
  /** Polite live-region message for the current edge / a nudge result. */
  announcement: string;
};

export const initialEdgeFocusState: EdgeFocusState = {
  eventId: null,
  edge: null,
  announcement: "",
};

export const useEdgeFocusStore = create<EdgeFocusState>()(
  devtools(() => initialEdgeFocusState, {
    name: "compass/edge-focus",
    enabled: IS_DEV,
  }),
);

const EDGE_CYCLE: (EventEdge | null)[] = [null, "startDate", "endDate"];

const edgeAnnouncement = (edge: EventEdge | null) =>
  edge === "startDate"
    ? "Editing start time"
    : edge === "endDate"
      ? "Editing end time"
      : "Editing whole event";

export const edgeFocusActions = {
  /** Cycles the given event's edge focus: whole event → start → end → wrap. */
  cycle: (eventId: string, direction: "forward" | "backward") => {
    const current = useEdgeFocusStore.getState();
    const currentEdge = current.eventId === eventId ? current.edge : null;
    const index = EDGE_CYCLE.indexOf(currentEdge);
    const step = direction === "forward" ? 1 : -1;
    const nextEdge =
      EDGE_CYCLE[(index + step + EDGE_CYCLE.length) % EDGE_CYCLE.length]!;

    useEdgeFocusStore.setState(
      { eventId, edge: nextEdge, announcement: edgeAnnouncement(nextEdge) },
      false,
      { type: "cycle" },
    );
  },
  /** Sets the focused edge directly (e.g. after a keyboard nudge flip). */
  setEdge: (eventId: string, edge: EventEdge, announcement: string) =>
    useEdgeFocusStore.setState({ eventId, edge, announcement }, false, {
      type: "setEdge",
    }),
  reset: () =>
    useEdgeFocusStore.setState(initialEdgeFocusState, false, {
      type: "reset",
    }),
};

export const selectEdgeForEvent =
  (eventId: string | null | undefined) => (state: EdgeFocusState) =>
    eventId && state.eventId === eventId ? state.edge : null;

export const selectEdgeFocusAnnouncement = (state: EdgeFocusState) =>
  state.announcement;

export const selectEdgeFocusActive = (state: EdgeFocusState) =>
  state.eventId !== null && state.edge !== null;
