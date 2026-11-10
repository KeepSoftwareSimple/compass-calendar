import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { suspendCalendarGridInteraction } from "@web/events/stores/suspendCalendarGridInteraction";
import {
  edgeFocusActions,
  initialEdgeFocusState,
  useEdgeFocusStore,
} from "@web/grid/shortcuts/edge-focus.store";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import {
  datePickerHintActions,
  resetDatePickerHintStoreForTests,
  useDatePickerHintStore,
} from "@web/shortcuts/tips/date-picker-hint.store";
import { describe, expect, it } from "bun:test";

describe("suspendCalendarGridInteraction", () => {
  it("discards a form-closed keyboardPlace draft and clears jump state", () => {
    draftActions.startGridDraft({
      activity: "keyboardPlace",
      draft: createGridEventDraft(
        timedGridSchedule(
          new Date("2026-05-20T09:00:00.000"),
          new Date("2026-05-20T10:00:00.000"),
        ),
      ),
    });
    eventJumpActions.setActive(true);

    suspendCalendarGridInteraction();

    expect(useDraftStore.getState().gridDraft).toBeNull();
    expect(useDraftStore.getState().status?.activity).toBeNull();
  });

  it("pops calendar-only date picker hints but keeps life picker help", () => {
    resetDatePickerHintStoreForTests();
    datePickerHintActions.push({
      id: "date-picker-life",
      parts: ["life hint"],
    });
    datePickerHintActions.push({
      id: "date-picker-sidebar-month",
      parts: ["month hint"],
    });

    suspendCalendarGridInteraction();

    const ids = useDatePickerHintStore.getState().stack.map((s) => s.id);
    expect(ids).toEqual(["date-picker-life"]);
    resetDatePickerHintStoreForTests();
  });

  it("resets edge focus", () => {
    edgeFocusActions.setEdge("evt", "startDate", "Editing start time");
    suspendCalendarGridInteraction();
    expect(useEdgeFocusStore.getState()).toEqual(initialEdgeFocusState);
  });
});
