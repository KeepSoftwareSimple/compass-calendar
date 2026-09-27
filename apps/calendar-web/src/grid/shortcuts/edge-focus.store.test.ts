import {
  edgeFocusActions,
  initialEdgeFocusState,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { beforeEach, describe, expect, it } from "bun:test";

describe("edgeFocusActions.cycle", () => {
  beforeEach(() => {
    useEdgeFocusStore.setState(initialEdgeFocusState, true);
  });

  it("cycles whole event -> start -> end -> whole event going forward", () => {
    edgeFocusActions.cycle("event-1", "forward");
    expect(useEdgeFocusStore.getState().edge).toBe("startDate");

    edgeFocusActions.cycle("event-1", "forward");
    expect(useEdgeFocusStore.getState().edge).toBe("endDate");

    edgeFocusActions.cycle("event-1", "forward");
    expect(useEdgeFocusStore.getState().edge).toBeNull();
  });

  it("cycles start <- end <- whole event going backward", () => {
    edgeFocusActions.cycle("event-1", "backward");
    expect(useEdgeFocusStore.getState().edge).toBe("endDate");

    edgeFocusActions.cycle("event-1", "backward");
    expect(useEdgeFocusStore.getState().edge).toBe("startDate");

    edgeFocusActions.cycle("event-1", "backward");
    expect(useEdgeFocusStore.getState().edge).toBeNull();
  });

  it("starts a fresh cycle when a different event is targeted", () => {
    edgeFocusActions.cycle("event-1", "forward");
    edgeFocusActions.cycle("event-1", "forward");
    expect(useEdgeFocusStore.getState().edge).toBe("endDate");

    edgeFocusActions.cycle("event-2", "forward");
    expect(useEdgeFocusStore.getState()).toMatchObject({
      eventId: "event-2",
      edge: "startDate",
    });
  });

  it("sets an announcement for each edge", () => {
    edgeFocusActions.cycle("event-1", "forward");
    expect(useEdgeFocusStore.getState().announcement).toBe(
      "Editing start time",
    );

    edgeFocusActions.cycle("event-1", "forward");
    expect(useEdgeFocusStore.getState().announcement).toBe("Editing end time");

    edgeFocusActions.cycle("event-1", "forward");
    expect(useEdgeFocusStore.getState().announcement).toBe(
      "Editing whole event",
    );
  });
});

describe("edgeFocusActions.setEdge / reset", () => {
  beforeEach(() => {
    useEdgeFocusStore.setState(initialEdgeFocusState, true);
  });

  it("sets the edge directly", () => {
    edgeFocusActions.setEdge("event-1", "endDate", "End 9:15 AM");

    expect(useEdgeFocusStore.getState()).toMatchObject({
      eventId: "event-1",
      edge: "endDate",
      announcement: "End 9:15 AM",
    });
  });

  it("resets to the initial state", () => {
    edgeFocusActions.setEdge("event-1", "endDate", "End 9:15 AM");
    edgeFocusActions.reset();

    expect(useEdgeFocusStore.getState()).toEqual(initialEdgeFocusState);
  });
});
