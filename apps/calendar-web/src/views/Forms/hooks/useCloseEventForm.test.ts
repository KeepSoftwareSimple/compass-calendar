import { renderHook } from "@testing-library/react";
import { EventIdSchema } from "@core/types/domain-primitives";
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
import { WEEK_INTERACTION_EVENT_ID_ATTRIBUTE } from "@web/grid/interaction/view-event-registry";
import { useCloseEventForm } from "./useCloseEventForm";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const EXISTING_EVENT_ID = "507f1f77bcf86cd799439011";

let pendingFrames: FrameRequestCallback[];
let originalRequestAnimationFrame: typeof requestAnimationFrame;

const flushFrame = () => {
  const frames = pendingFrames.splice(0);
  frames.forEach((frame) => frame(performance.now()));
};

beforeEach(() => {
  pendingFrames = [];
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((frame: FrameRequestCallback) =>
    pendingFrames.push(frame)) as typeof requestAnimationFrame;
});

afterEach(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  draftActions.discard();
  document.body.innerHTML = "";
});

describe("useCloseEventForm", () => {
  it("should discard the draft (which closes the form)", () => {
    draftActions.startGridDraft({
      activity: "gridClick",
      draft: createGridEventDraft(
        timedGridSchedule(
          new Date("2026-05-20T09:00:00.000Z"),
          new Date("2026-05-20T10:00:00.000Z"),
        ),
      ),
    });
    draftActions.setFormOpen(true);

    const { result } = renderHook(() => useCloseEventForm());

    result.current();

    expect(useDraftStore.getState()).toEqual(initialDraftState);
  });

  it("restores focus to the grid event for the closed draft", () => {
    const draft = editGridEventDraft(
      createMockEvent({ id: EventIdSchema.parse(EXISTING_EVENT_ID) }),
    );
    if (!draft) throw new Error("expected an edit draft");

    const card = document.createElement("button");
    card.setAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, EXISTING_EVENT_ID);
    card.tabIndex = 0;
    document.body.appendChild(card);

    draftActions.startGridDraft({ activity: "keyboardEdit", draft });
    draftActions.setFormOpen(true);

    const { result } = renderHook(() => useCloseEventForm());
    result.current();
    flushFrame();

    expect(useDraftStore.getState()).toEqual(initialDraftState);
    expect(document.activeElement).toBe(card);
  });

  it("does not leave focus on a draft portal that unmounts after discard", () => {
    const draft = editGridEventDraft(
      createMockEvent({ id: EventIdSchema.parse(EXISTING_EVENT_ID) }),
    );
    if (!draft) throw new Error("expected an edit draft");

    const draftPortal = document.createElement("button");
    draftPortal.setAttribute(
      WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
      EXISTING_EVENT_ID,
    );
    draftPortal.setAttribute("data-grid-event-surface", "draft");
    draftPortal.tabIndex = 0;
    document.body.appendChild(draftPortal);

    draftActions.startGridDraft({ activity: "keyboardEdit", draft });
    draftActions.setFormOpen(true);

    const { result } = renderHook(() => useCloseEventForm());
    result.current();

    // Simulate React committing: draft portal gone, saved card remounted.
    draftPortal.remove();
    const savedCard = document.createElement("button");
    savedCard.setAttribute(
      WEEK_INTERACTION_EVENT_ID_ATTRIBUTE,
      EXISTING_EVENT_ID,
    );
    savedCard.tabIndex = 0;
    document.body.appendChild(savedCard);

    flushFrame();

    expect(document.activeElement).toBe(savedCard);
  });

  it("focuses an explicit saved event id when it differs from the draft id", () => {
    const draftClientId = EventIdSchema.parse("507f1f77bcf86cd799439022");
    const savedEventId = EventIdSchema.parse("507f1f77bcf86cd799439033");

    const savedCard = document.createElement("button");
    savedCard.setAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, savedEventId);
    savedCard.tabIndex = 0;
    document.body.appendChild(savedCard);

    draftActions.startGridDraft({
      activity: "createShortcut",
      draft: createGridEventDraft(
        timedGridSchedule(
          new Date("2026-05-20T09:00:00.000Z"),
          new Date("2026-05-20T10:00:00.000Z"),
        ),
        draftClientId,
      ),
    });
    draftActions.setFormOpen(true);

    const { result } = renderHook(() => useCloseEventForm());
    result.current(savedEventId);
    flushFrame();

    expect(useDraftStore.getState()).toEqual(initialDraftState);
    expect(document.activeElement).toBe(savedCard);
  });

  it("ignores a non-string close argument and focuses the draft id", () => {
    const draft = editGridEventDraft(
      createMockEvent({ id: EventIdSchema.parse(EXISTING_EVENT_ID) }),
    );
    if (!draft) throw new Error("expected an edit draft");

    const card = document.createElement("button");
    card.setAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, EXISTING_EVENT_ID);
    card.tabIndex = 0;
    document.body.appendChild(card);

    draftActions.startGridDraft({ activity: "keyboardEdit", draft });
    draftActions.setFormOpen(true);

    const { result } = renderHook(() => useCloseEventForm());
    result.current({} as never);
    flushFrame();

    expect(document.activeElement).toBe(card);
  });
});
