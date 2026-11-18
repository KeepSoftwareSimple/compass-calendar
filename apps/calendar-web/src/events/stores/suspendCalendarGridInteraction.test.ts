import { calendarGridSidebarModeHintsEligible } from "@core/shortcuts/sidebar-hint-surface";
import { EventScheduleSchema } from "@core/types/event.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  createGridEventDraft,
  editGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  draftActions,
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
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
import { beforeEach, describe, expect, it } from "bun:test";

describe("suspendCalendarGridInteraction", () => {
  beforeEach(() => {
    useDraftStore.setState(initialDraftState, true);
  });

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

  it("keeps an open createShortcut draft with a typed title", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );
    draft.values.title = "Quarterly review";
    draftActions.startGridDraft({ activity: "createShortcut", draft });

    suspendCalendarGridInteraction();

    expect(useDraftStore.getState().gridDraft?.values.title).toBe(
      "Quarterly review",
    );
    expect(useDraftStore.getState().status?.activity).toBe("createShortcut");
    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);
  });

  it("keeps a keyboardEdit draft with unsaved changes", () => {
    const existingEvent = createMockEvent({
      content: { kind: "details", title: "Existing Event", description: "" },
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-05-20T14:00:00.000Z",
        end: "2026-05-20T15:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const draft = editGridEventDraft(existingEvent);
    if (!draft) throw new Error("expected an edit draft");
    draft.values.title = "Changed title";
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    suspendCalendarGridInteraction();

    expect(useDraftStore.getState().gridDraft?.values.title).toBe(
      "Changed title",
    );
    expect(useDraftStore.getState().status?.activity).toBe("keyboardEdit");
    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);
  });

  it("drops form-closed keyboardPlace so Life cannot show placement hints", () => {
    draftActions.startGridDraft({
      activity: "keyboardPlace",
      draft: createGridEventDraft(
        timedGridSchedule(
          new Date("2026-05-20T09:00:00.000"),
          new Date("2026-05-20T10:00:00.000"),
        ),
      ),
    });

    suspendCalendarGridInteraction();

    expect(useDraftStore.getState().gridDraft).toBeNull();
    expect(
      calendarGridSidebarModeHintsEligible("/life") &&
        useDraftStore.getState().status?.activity === "keyboardPlace",
    ).toBe(false);
  });
});
