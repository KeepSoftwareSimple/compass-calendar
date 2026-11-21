import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  draftActions,
  initialDraftState,
  selectGridDraft,
  useDraftStore,
} from "./draft.store";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  useDraftStore.setState(initialDraftState, true);
});

describe("draftActions.startGridDraft", () => {
  it("stores the canonical draft", () => {
    const draft = createGridEventDraft({
      kind: "allDay",
      start: new Date("2026-05-20"),
      end: new Date("2026-05-21"),
    });

    draftActions.startGridDraft({ activity: "gridClick", draft });

    const state = useDraftStore.getState();
    expect(selectGridDraft(state)).toBe(draft);
    expect(state.status).toMatchObject({
      activity: "gridClick",
      eventType: "allday",
      isDrafting: true,
      isFormOpen: true,
    });
  });

  it("keeps the form closed for keyboard place-create", () => {
    const draft = createGridEventDraft({
      kind: "allDay",
      start: new Date("2026-05-20"),
      end: new Date("2026-05-21"),
    });

    draftActions.startGridDraft({ activity: "keyboardPlace", draft });

    expect(useDraftStore.getState().status?.isFormOpen).toBe(false);
  });

  it("keeps the form closed for event right-click", () => {
    const draft = createGridEventDraft({
      kind: "allDay",
      start: new Date("2026-05-20"),
      end: new Date("2026-05-21"),
    });

    draftActions.startGridDraft({ activity: "eventRightClick", draft });

    expect(useDraftStore.getState().status?.isFormOpen).toBe(false);
  });

  it("opens the form for keyboard edit", () => {
    const draft = createGridEventDraft({
      kind: "allDay",
      start: new Date("2026-05-20"),
      end: new Date("2026-05-21"),
    });

    draftActions.startGridDraft({ activity: "keyboardEdit", draft });

    expect(useDraftStore.getState().status?.isFormOpen).toBe(true);
  });
});

describe("draftActions.setGridDraft", () => {
  const timedDraft = (start: string, end: string) =>
    createGridEventDraft(timedGridSchedule(new Date(start), new Date(end)));

  // Keyboard place-create and form-field edits call setGridDraft on every
  // change, so it has to leave the gesture's own status alone: bumping
  // `activity` would break the consumers that branch on it, and flipping
  // `isFormOpen` would pop the form mid-place.
  it("carries activity and isFormOpen through untouched", () => {
    draftActions.startGridDraft({
      activity: "keyboardPlace",
      draft: timedDraft("2026-05-20T10:00:00.000Z", "2026-05-20T10:15:00.000Z"),
    });

    const next = timedDraft(
      "2026-05-20T10:00:00.000Z",
      "2026-05-20T11:00:00.000Z",
    );
    draftActions.setGridDraft(next);

    const state = useDraftStore.getState();
    expect(selectGridDraft(state)).toBe(next);
    expect(state.status).toMatchObject({
      activity: "keyboardPlace",
      eventType: "timed",
      isDrafting: true,
      isFormOpen: false,
    });
  });

  // Same reason: a fresh status object per move would re-render every status
  // subscriber for a value that never changed.
  it("keeps the same status reference when nothing about it changed", () => {
    draftActions.startGridDraft({
      activity: "keyboardPlace",
      draft: timedDraft("2026-05-20T10:00:00.000Z", "2026-05-20T10:15:00.000Z"),
    });
    const statusBefore = useDraftStore.getState().status;

    draftActions.setGridDraft(
      timedDraft("2026-05-20T10:00:00.000Z", "2026-05-20T11:00:00.000Z"),
    );

    expect(useDraftStore.getState().status).toBe(statusBefore);
  });

  it("resets status when the draft is cleared", () => {
    draftActions.startGridDraft({
      activity: "keyboardPlace",
      draft: timedDraft("2026-05-20T10:00:00.000Z", "2026-05-20T10:15:00.000Z"),
    });

    draftActions.setGridDraft(null);

    const state = useDraftStore.getState();
    expect(selectGridDraft(state)).toBeNull();
    expect(state.status).toMatchObject({
      activity: null,
      isDrafting: false,
      isFormOpen: false,
    });
  });
});
