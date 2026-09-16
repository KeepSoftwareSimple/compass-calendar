import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { repositionDraftByKeyboard } from "@web/common/utils/draft/reposition-draft-by-keyboard.util";
import { type EventMutationDependencies } from "@web/events/mutations/useEventMutations";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { dayEventTargeting } from "@web/grid/interaction/view-event-registry";
import { useGridEventEditShortcuts } from "@web/grid/shortcuts/useGridEventEditShortcuts";
import { useGridEventFormFieldSequences } from "@web/grid/shortcuts/useGridEventFormFieldSequences";
import {
  type ActiveShiftHint,
  useShiftHoldEventHints,
} from "@web/shortcuts/shift-hint/useShiftHoldEventHints";

/**
 * Day-view edit shortcuts: Delete, Mod+D, Shift+arrows (nudge / day-move),
 * Arrow keys to reposition an open draft or focus the neighboring event, and
 * `e`+field sequences to open/focus form fields.
 * Shift+ArrowLeft/Right move a focused event by one day and follow that day
 * in the Day view. Period navigation (changing the visible day) stays on j/k.
 */
export function useDayEventNudgeShortcuts({
  allDayEvents = [],
  createDraftAtTime,
  dependencies = {},
  getQuickTimeDay,
  navigateToDate,
  placeTimedDraft,
  timedEvents,
  visibleDays,
}: {
  allDayEvents?: GridEvent[];
  /** Quick-time create: place a draft at a typed start time. */
  createDraftAtTime: (start: Dayjs) => void;
  dependencies?: EventMutationDependencies;
  /** The day a typed time lands on - the date currently in view. */
  getQuickTimeDay: () => Dayjs;
  /** Follow draft Left/Right moves so the draft stays on screen. */
  navigateToDate?: (date: Dayjs) => void;
  /** Shift+Arrow place-create when nothing is focused and no draft can move. */
  placeTimedDraft?: () => void;
  timedEvents: GridEvent[];
  /** The one column on screen, so its day letter selects it even when empty. */
  visibleDays: Dayjs[];
}): {
  getEditSequenceAnchor: () => HTMLElement | null;
  shiftHints: ActiveShiftHint[];
} {
  // getFocused is registry-backed and gates everything that mutates an event.
  // The navigable pair also covers read-only cards, which can be focused and
  // navigated but never edited.
  const targeting = {
    focus: dayEventTargeting.focusGridEventTarget,
    getFocused: dayEventTargeting.getFocusedGridEventTarget,
    getFocusedNavigable: dayEventTargeting.getFocusedNavigableGridEventTarget,
    listNavigable: dayEventTargeting.listNavigableGridEventTargets,
  };

  useGridEventEditShortcuts({
    allDayEvents,
    dependencies,
    getPasteTargetDay: getQuickTimeDay,
    timedEvents,
    dayBoundary: {
      kind: "follow",
      onCrossed: (date) => navigateToDate?.(date),
    },
    placeTimedDraft,
    targeting,
    repositionDraftByKey: (key, step) => {
      const { gridDraft, status } = useDraftStore.getState();
      const previousStart = gridDraft
        ? dayjs(gridDraft.values.schedule.start).startOf("day")
        : null;

      const nextDraft = repositionDraftByKeyboard({
        activity: status?.activity,
        draft: gridDraft,
        key,
        step,
      });
      if (!nextDraft) return false;

      draftActions.setGridDraft(nextDraft);

      const nextStart = dayjs(nextDraft.values.schedule.start).startOf("day");
      if (previousStart && !nextStart.isSame(previousStart, "day")) {
        navigateToDate?.(nextStart);
      }
      return true;
    },
  });

  const { getMenuAnchor: getEditSequenceAnchor } =
    useGridEventFormFieldSequences({
      allDayEvents,
      targeting,
      timedEvents,
    });

  const { hints: shiftHints } = useShiftHoldEventHints({
    allDayEvents,
    createAtTime: createDraftAtTime,
    focus: targeting.focus,
    getQuickTimeDay,
    listVisible: targeting.listNavigable,
    timedEvents,
    visibleDays,
  });

  return { getEditSequenceAnchor, shiftHints };
}
