import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { Categories_Event } from "@web/common/types/web.event.types";
import { type GridEventDraft } from "@web/events/event-draft.types";

export type Activity_DraftEvent =
  | "createShortcut"
  | "eventRightClick"
  | "gridClick"
  | "keyboardEdit"
  /**
   * Shift+Arrow place-create: timed draft on the grid with the form closed so
   * the user can keep repositioning before opening details with Enter.
   */
  | "keyboardPlace";

const OPENS_FORM_ON_START: ReadonlySet<Activity_DraftEvent> = new Set([
  "createShortcut",
  "gridClick",
  "keyboardEdit",
]);

export interface Status_DraftEvent {
  activity: Activity_DraftEvent | null;
  eventType?: Categories_Event | null;
  isDrafting: boolean;
  /**
   * Whether the floating event form is shown for the current draft. Kept
   * separate from `isDrafting`/`activity` because a draft can exist without the
   * form being open (Shift+Arrow place-create keeps the form closed until Enter).
   */
  isFormOpen: boolean;
}

export interface State_DraftEvent {
  status: Status_DraftEvent | null;
  /** Canonical draft for grid creation, editing, and form paths. */
  gridDraft: GridEventDraft | null;
}

const initialDraftStatus: Status_DraftEvent = {
  activity: null,
  isDrafting: false,
  isFormOpen: false,
  eventType: null,
};

export const initialDraftState: State_DraftEvent = {
  status: initialDraftStatus,
  gridDraft: null,
};

// Selectors passed to this hook must return primitives or stable references;
// a selector that builds a new object/array each call needs `useShallow`.
export const useDraftStore = create<State_DraftEvent>()(
  devtools(() => initialDraftState, {
    name: "compass/draft",
    enabled: IS_DEV,
  }),
);

export const draftActions = {
  discard: () =>
    useDraftStore.setState(initialDraftState, true, { type: "discard" }),

  startGridDraft: ({
    activity,
    draft,
  }: {
    activity: Activity_DraftEvent;
    draft: GridEventDraft;
  }) =>
    useDraftStore.setState(
      (state) => ({
        gridDraft: draft,
        status: {
          ...(state.status ?? initialDraftStatus),
          activity,
          eventType:
            draft.values.schedule.kind === "allDay"
              ? Categories_Event.ALLDAY
              : Categories_Event.TIMED,
          isDrafting: true,
          isFormOpen: OPENS_FORM_ON_START.has(activity),
        },
      }),
      false,
      { type: "startGridDraft" },
    ),

  // Reuses the existing `status` object when it already says what this call
  // would set. Keyboard reposition and form field edits call this on every
  // change, and a fresh `status` each time would re-render every
  // status subscriber for a value that never changed. `activity` and
  // `isFormOpen` stay with the gesture that started the draft.
  setGridDraft: (draft: GridEventDraft | null) =>
    useDraftStore.setState(
      (state) => {
        if (!draft) {
          return { gridDraft: null, status: initialDraftStatus };
        }

        const status = state.status ?? initialDraftStatus;
        const eventType =
          draft.values.schedule.kind === "allDay"
            ? Categories_Event.ALLDAY
            : Categories_Event.TIMED;
        const isUnchanged = status.isDrafting && status.eventType === eventType;

        return {
          gridDraft: draft,
          status: isUnchanged
            ? status
            : { ...status, eventType, isDrafting: true },
        };
      },
      false,
      { type: "setGridDraft" },
    ),

  // No-op when already at the requested value so redundant callers do not
  // re-render every status subscriber.
  setFormOpen: (isFormOpen: boolean) =>
    useDraftStore.setState(
      (state) =>
        Boolean(state.status?.isFormOpen) === isFormOpen
          ? {}
          : {
              status: {
                ...(state.status ?? initialDraftStatus),
                isFormOpen,
              },
            },
      false,
      { type: "setFormOpen" },
    ),
};

export const selectGridDraft = (state: State_DraftEvent) => state.gridDraft;

export const selectDraftActivity = (state: State_DraftEvent) =>
  state.status?.activity;

export const selectDraftId = (state: State_DraftEvent) =>
  state.gridDraft
    ? state.gridDraft.kind === "edit"
      ? state.gridDraft.source.id
      : state.gridDraft.clientId
    : undefined;

export const selectIsEventFormOpen = (state: State_DraftEvent) =>
  Boolean(state.status?.isFormOpen) && state.gridDraft !== null;

/** Imperative read for keyboard/pointer handlers outside React's render cycle. */
export const isEventFormOpen = () =>
  selectIsEventFormOpen(useDraftStore.getState());

export const selectIsDrafting = (state: State_DraftEvent) =>
  state.status?.isDrafting;
