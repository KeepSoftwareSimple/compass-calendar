import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";

export type EventJumpState = {
  isActive: boolean;
  /** Digits typed toward a start time so far; "" when idle. */
  quickTimeDigits: string;
  /** YYYY-MM-DD keys for highlighted day column(s). */
  activeDayKeys: string[];
  /** Polite live-region message for mode / day selection. */
  announcement: string;
  /** Assignment surfaced after a blocked click selects a specific event. */
  pointerHintKey: string | null;
  /** Event that owns `pointerHintKey`, so rebuilds can refresh the token. */
  pointerHintEventId: string | null;
  // Keyboard-targeted event is not stored here. It lives in the hint hook as
  // a local ref plus DOM focus, which is why Enter has nothing in this store
  // to check. Recorded as a wart (WP-12); do not fold targeting into this
  // store in a drive-by.
  /** Date selected by the latest blocked empty-grid click. */
  pointerDraftDateKey: string | null;
  pointerDraftStart: string | null;
  pointerDraftTimeKey: string | null;
  /** Day prefixes with somewhere to land right now, in weekday order. Read by
   * the sidebar tip so it only teaches a key that would work. */
  jumpableDayPrefixes: string[];
};

export const initialEventJumpState: EventJumpState = {
  isActive: false,
  quickTimeDigits: "",
  activeDayKeys: [],
  announcement: "",
  pointerHintKey: null,
  pointerHintEventId: null,
  pointerDraftDateKey: null,
  pointerDraftStart: null,
  pointerDraftTimeKey: null,
  jumpableDayPrefixes: [],
};

export const useEventJumpStore = create<EventJumpState>()(
  devtools(() => initialEventJumpState, {
    name: "compass/event-jump",
    enabled: IS_DEV,
  }),
);

export const eventJumpActions = {
  setActive: (isActive: boolean) => {
    if (isActive) shortcutHintProgressActions.demonstrate("event-jump");
    useEventJumpStore.setState(
      {
        isActive,
        activeDayKeys: isActive
          ? useEventJumpStore.getState().activeDayKeys
          : [],
        announcement: isActive ? "Event jump on" : "Event jump off",
        ...(!isActive
          ? { pointerHintKey: null, pointerHintEventId: null }
          : {}),
      },
      false,
      { type: "setActive" },
    );
  },
  setQuickTimeDigits: (quickTimeDigits: string) => {
    if (useEventJumpStore.getState().quickTimeDigits === quickTimeDigits)
      return;
    useEventJumpStore.setState({ quickTimeDigits }, false, {
      type: "setQuickTimeDigits",
    });
  },
  /** Clear a lingering exit announcement after the live region has spoken. */
  clearAnnouncement: () =>
    useEventJumpStore.setState({ announcement: "" }, false, {
      type: "clearAnnouncement",
    }),
  setActiveDayKeys: (activeDayKeys: string[], announcement?: string) =>
    useEventJumpStore.setState(
      {
        activeDayKeys,
        ...(announcement !== undefined ? { announcement } : {}),
      },
      false,
      { type: "setActiveDayKeys" },
    ),
  setPointerHint: (pointerHint: { eventId: string; key: string } | null) =>
    useEventJumpStore.setState(
      {
        pointerHintKey: pointerHint?.key ?? null,
        pointerHintEventId: pointerHint?.eventId ?? null,
      },
      false,
      { type: "setPointerHint" },
    ),
  setPointerDraftIntent: (
    pointerDraft: { date: string; start?: string; timeKey?: string } | null,
  ) =>
    useEventJumpStore.setState(
      {
        pointerDraftDateKey: pointerDraft?.date ?? null,
        pointerDraftStart: pointerDraft?.start ?? null,
        pointerDraftTimeKey: pointerDraft?.timeKey ?? null,
      },
      false,
      { type: "setPointerDraftIntent" },
    ),
  setJumpableDayPrefixes: (jumpableDayPrefixes: string[]) => {
    const current = useEventJumpStore.getState().jumpableDayPrefixes;
    if (
      current.length === jumpableDayPrefixes.length &&
      current.every((prefix, i) => prefix === jumpableDayPrefixes[i])
    ) {
      return;
    }
    useEventJumpStore.setState({ jumpableDayPrefixes }, false, {
      type: "setJumpableDayPrefixes",
    });
  },
  reset: () =>
    useEventJumpStore.setState(initialEventJumpState, false, { type: "reset" }),
};

export const selectEventJumpActive = (state: EventJumpState) => state.isActive;

export const selectQuickTimeDigits = (state: EventJumpState) =>
  state.quickTimeDigits;

/** Imperative read for plain event handlers outside React, mirroring
 * `isEditSequenceArmed` so the two keyboard modes can yield to each other. */
export const isEventJumpActive = () => useEventJumpStore.getState().isActive;

export const selectEventJumpActiveDayKeys = (state: EventJumpState) =>
  state.activeDayKeys;

export const selectPointerDraftDateKey = (state: EventJumpState) =>
  state.pointerDraftDateKey;

export const selectEventJumpAnnouncement = (state: EventJumpState) =>
  state.announcement;

export const selectJumpableDayPrefixes = (state: EventJumpState) =>
  state.jumpableDayPrefixes;
