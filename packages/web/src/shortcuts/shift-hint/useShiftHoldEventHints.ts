import { useEffect, useRef, useState } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";
import { isRecurrenceScopeAskReady } from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { recurrenceScopeForToastDigit } from "@web/events/recurrence/recurrence-scope-toast-digit";
import { isEventFormOpen } from "@web/events/stores/draft.store";
import { isAppLocked } from "@web/shortcuts/app-lock";
import {
  digitPickIndex,
  PICK_KEY_LABELS,
} from "@web/shortcuts/digit-pick.util";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";
import { isFloatingLayerOpen } from "@web/shortcuts/floating-layer";
import {
  isBareLetterKey,
  keyboardKey,
  normalizedKeyboardKey,
} from "@web/shortcuts/is-bare-letter-key";
import {
  POINTER_EVENT_JUMP_REQUEST,
  POINTER_GRID_CREATE_REQUEST,
  pointerEventJumpId,
  pointerGridIntent,
} from "@web/shortcuts/keyboard-only/pointer-grid-bridge";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  canQuickTimeBufferGrow,
  quickTimeFocusedColumnDay,
  resolveQuickTimeStart,
} from "@web/shortcuts/quick-time/quick-time.util";
import {
  assignDayJumpKeys,
  DAY_JUMP_PREFIX_BY_WEEKDAY,
  type DayJumpAssignment,
  type DayJumpMatchResult,
  type DayJumpWeekday,
  DIGIT_AMBIGUOUS_COMMIT_MS,
  dayJumpPrefixesForWeekdays,
  dayNameForPrefix,
  filterHintsByPrefix,
  matchDayJumpKeystroke,
} from "@web/shortcuts/shift-hint/assign-shift-hint-keys";
import {
  eventJumpActions,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { createKeyupSwallow } from "@web/shortcuts/swallow-next-keyup";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import { isEditSequenceArmed } from "@web/shortcuts/useEditSequenceShortcut";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

export type ShiftHintFocusTarget = {
  eventId: string;
  eventType: "all-day" | "timed";
  element: HTMLElement;
};

export type ActiveShiftHint = DayJumpAssignment & {
  element: HTMLElement;
};

export type EventJumpHintsResult = {
  hints: ActiveShiftHint[];
};

/** Digit keys only: PICK_KEY_LABELS' last two entries are "-" and "=". */
const DIGIT_PICK_COUNT = 10;

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

/** Preserve the exact instant taught after a blocked empty-grid click. */
const pointerDraftStart = (digits: string): Dayjs | null => {
  const { pointerDraftStart: start, pointerDraftTimeKey } =
    useEventJumpStore.getState();
  if (!start || pointerDraftTimeKey !== digits) return null;

  return dayjs(start).tz(getEffectiveTimeZone());
};

/** Parked click, then a single jump-highlighted column. */
const focusedColumnDay = (): Dayjs | null => {
  const { pointerDraftDateKey, activeDayKeys } = useEventJumpStore.getState();

  return quickTimeFocusedColumnDay(pointerDraftDateKey, activeDayKeys);
};

/**
 * Day columns are entered with Shift so they never race the bare-letter
 * commands they used to lose to (`t` today, `f` notice focus, `m` event menu).
 */
const isShiftedSingleChar = (event: KeyboardEvent) => {
  const key = keyboardKey(event);
  return (
    key.length === 1 &&
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  );
};

const FALLBACK_SCHEDULE = {
  startMs: 0,
  dayKey: "1970-01-01",
  weekday: 0,
} as const;

type ScheduleMeta = {
  startMs: number;
  dayKey: string;
  weekday: number;
};

const scheduleMeta = (event: GridEvent): ScheduleMeta => {
  if (!event.startDate) return FALLBACK_SCHEDULE;
  const start = dayjs(event.startDate);
  return {
    startMs: start.valueOf(),
    dayKey: start.format(YEAR_MONTH_DAY_FORMAT),
    weekday: start.day(),
  };
};

const toActiveHints = (
  assignments: DayJumpAssignment[],
  visibleById: Map<string, ShiftHintFocusTarget>,
): ActiveShiftHint[] =>
  assignments.flatMap((assignment) => {
    const target = visibleById.get(assignment.eventId);
    if (!target) return [];
    return [{ ...assignment, element: target.element }];
  });

/** Assign day-jump keys for the currently registered grid targets. */
const buildDayJumpAssignments = (
  visible: ShiftHintFocusTarget[],
  events: GridEvent[],
): {
  assignments: DayJumpAssignment[];
  visibleById: Map<string, ShiftHintFocusTarget>;
} => {
  const scheduleById = new Map<string, ScheduleMeta>();
  for (const event of events) {
    if (!event._id) continue;
    scheduleById.set(event._id, scheduleMeta(event));
  }

  const targets = visible.map((target) => {
    const meta = scheduleById.get(target.eventId) ?? FALLBACK_SCHEDULE;
    return {
      eventId: target.eventId,
      eventType: target.eventType,
      startMs: meta.startMs,
      dayKey: meta.dayKey,
      weekday: meta.weekday,
    };
  });

  return {
    assignments: assignDayJumpKeys(targets),
    visibleById: new Map(visible.map((target) => [target.eventId, target])),
  };
};

/**
 * Press `h` to show day-prefix jump labels, or Shift+<day letter> to enter
 * jump mode straight onto that column (`Shift+W`, `Shift+S` then `u`/`a`).
 * Any visible column can be selected, empty ones included, so `c`, `Shift+C`,
 * and typed digits have a day to land on; a column with events also focuses
 * its first one. Shift is what makes the day columns always available: bare
 * `t`, `f`, and `m` keep their own commands. Once jump mode is on, the labels
 * are typed bare (`w`, `w1`…) and win over global shortcuts. Esc exits, a
 * second `h` toggles off. `s` is only the Sunday/Saturday prefix. `e` is not
 * a day prefix: jump yields to an armed (or about-to-arm) edit sequence so
 * `e` then `t` edits the title instead of selecting Tuesday. `c` is left
 * unclaimed too, so the create shortcuts can consume the selected column.
 *
 * Day view uses the same scheme on the one date it shows, so a bare digit is
 * never an event label on an empty buffer in either view. This listener owns
 * both digit meanings, so typed-time creation wins until a day prefix makes a
 * digit an event index.
 */
export function useShiftHoldEventHints({
  allDayEvents = [],
  createAtTime,
  focus,
  getQuickTimeDay,
  listVisible,
  timedEvents,
  visibleDays,
}: {
  allDayEvents?: GridEvent[];
  createAtTime: (start: Dayjs) => void;
  focus: (target: ShiftHintFocusTarget) => void;
  getQuickTimeDay: () => Dayjs;
  listVisible: () => ShiftHintFocusTarget[];
  timedEvents: GridEvent[];
  /** Columns on screen, so a day letter can select one with no events. */
  visibleDays: Dayjs[];
}): EventJumpHintsResult {
  const [hints, setHints] = useState<ActiveShiftHint[]>([]);
  const isActive = useEventJumpStore((state) => state.isActive);

  const isActiveRef = useRef(false);
  const bufferRef = useRef("");
  const assignmentsRef = useRef<DayJumpAssignment[]>([]);
  const visibleByIdRef = useRef<Map<string, ShiftHintFocusTarget>>(new Map());
  const ambiguousCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const quickTimeCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const columnTimeBurstRef = useRef<{ digit: string; at: number }[]>([]);
  /** Event last focused by jump. Not in the store (see event-jump.store wart). */
  const focusedJumpEventIdRef = useRef<string | null>(null);
  const createAtTimeRef = useRef(createAtTime);
  const focusRef = useRef(focus);
  const getQuickTimeDayRef = useRef(getQuickTimeDay);
  const listVisibleRef = useRef(listVisible);
  const allDayEventsRef = useRef(allDayEvents);
  const timedEventsRef = useRef(timedEvents);
  const visibleDaysRef = useRef(visibleDays);
  const publishedPrefixesRef = useRef<string[]>([]);

  createAtTimeRef.current = createAtTime;
  focusRef.current = focus;
  getQuickTimeDayRef.current = getQuickTimeDay;
  listVisibleRef.current = listVisible;
  allDayEventsRef.current = allDayEvents;
  timedEventsRef.current = timedEvents;
  visibleDaysRef.current = visibleDays;
  isActiveRef.current = isActive;

  useEffect(() => {
    const keyupSwallow = createKeyupSwallow();

    const clearAmbiguousCommitTimer = () => {
      if (ambiguousCommitTimerRef.current !== null) {
        clearTimeout(ambiguousCommitTimerRef.current);
        ambiguousCommitTimerRef.current = null;
      }
    };

    const clearQuickTimeCommitTimer = () => {
      if (quickTimeCommitTimerRef.current === null) return;
      clearTimeout(quickTimeCommitTimerRef.current);
      quickTimeCommitTimerRef.current = null;
    };

    const resetQuickTime = () => {
      clearQuickTimeCommitTimer();
      eventJumpActions.setQuickTimeDigits("");
    };

    const resetColumnTimeBurst = () => {
      columnTimeBurstRef.current = [];
    };

    const recentColumnTimeDigits = () => {
      const at = performance.now();
      columnTimeBurstRef.current = columnTimeBurstRef.current.filter(
        (entry) => at - entry.at < DIGIT_AMBIGUOUS_COMMIT_MS * 2,
      );
      return columnTimeBurstRef.current.map((entry) => entry.digit).join("");
    };

    const commitQuickTime = () => {
      const digits = useEventJumpStore.getState().quickTimeDigits;
      resetQuickTime();
      resetColumnTimeBurst();
      focusedJumpEventIdRef.current = null;
      clearAmbiguousCommitTimer();
      if (!digits) return;

      const now = dayjs().tz(getEffectiveTimeZone());
      const start =
        pointerDraftStart(digits) ??
        resolveQuickTimeStart(
          digits,
          now,
          focusedColumnDay() ?? getQuickTimeDayRef.current(),
        );
      if (!start) return;

      eventJumpActions.setPointerDraftIntent(null);
      // The slot placeholders have answered their question. Clear them before
      // creating so they do not flash over the new draft.
      eventJumpActions.setActive(false);
      createAtTimeRef.current(start);
    };

    const tryQuickTimeKey = (event: KeyboardEvent): boolean => {
      // A bare Shift keydown precedes every digit on layouts where the top row
      // is shifted, so it must never abandon a half-typed time.
      if (MODIFIER_KEYS.has(event.key)) return false;

      if (
        isAppLocked() ||
        isEditableKeyboardTarget(event) ||
        isEventFormOpen() ||
        isFloatingLayerOpen() ||
        isEditSequenceArmed()
      ) {
        resetQuickTime();
        return false;
      }

      const buffered = useEventJumpStore.getState().quickTimeDigits !== "";

      if (event.key === "Escape") {
        if (!buffered) return false;
        resetQuickTime();
        return true;
      }

      if (event.key === "Enter") {
        if (!buffered) return false;
        commitQuickTime();
        return true;
      }

      const pickIndex = digitPickIndex(event);
      if (pickIndex === null || pickIndex >= DIGIT_PICK_COUNT) {
        // Abandon a half-typed time while leaving the new command unclaimed.
        if (buffered) resetQuickTime();
        return false;
      }

      const next = `${
        useEventJumpStore.getState().quickTimeDigits
      }${PICK_KEY_LABELS[pickIndex]}`;
      eventJumpActions.setQuickTimeDigits(next);

      if (!canQuickTimeBufferGrow(next)) {
        commitQuickTime();
        return true;
      }

      clearQuickTimeCommitTimer();
      quickTimeCommitTimerRef.current = setTimeout(() => {
        quickTimeCommitTimerRef.current = null;
        if (useEventJumpStore.getState().quickTimeDigits !== next) return;
        commitQuickTime();
      }, DIGIT_AMBIGUOUS_COMMIT_MS);

      return true;
    };

    const dayKeyByPrefix = () =>
      Object.fromEntries(
        visibleDaysRef.current.map((day) => [
          DAY_JUMP_PREFIX_BY_WEEKDAY[day.day() as DayJumpWeekday],
          day.format(YEAR_MONTH_DAY_FORMAT),
        ]),
      );

    const clearHints = () => {
      clearAmbiguousCommitTimer();
      assignmentsRef.current = [];
      visibleByIdRef.current = new Map();
      bufferRef.current = "";
      setHints([]);
    };

    const rebuildAssignments = () => {
      // Label every registered event in the view (not only viewport cards) so
      // day indices stay stable while scrolling.
      const { assignments, visibleById } = buildDayJumpAssignments(
        listVisibleRef.current(),
        [...allDayEventsRef.current, ...timedEventsRef.current],
      );
      assignmentsRef.current = assignments;
      visibleByIdRef.current = visibleById;
      return assignments;
    };

    const publishFiltered = (buffer: string) => {
      const source = buffer
        ? filterHintsByPrefix(assignmentsRef.current, buffer)
        : assignmentsRef.current;
      setHints(toActiveHints(source, visibleByIdRef.current));
    };

    /** Drop trailing digits so the next index starts from the day prefix. */
    const stripDigitBuffer = () => {
      const dayPrefix = bufferRef.current.replace(/\d+$/, "");
      if (dayPrefix === bufferRef.current) return;
      bufferRef.current = dayPrefix;
      publishFiltered(dayPrefix);
    };

    // Activates even with nothing to label: the quick-time slot placeholders
    // are the whole point of `h` on an empty day.
    const activate = () => {
      if (isAppLocked()) return;
      const assignments = rebuildAssignments();
      isActiveRef.current = true;
      bufferRef.current = "";
      resetColumnTimeBurst();
      focusedJumpEventIdRef.current = null;
      eventJumpActions.setActive(true);
      eventJumpActions.setActiveDayKeys([]);
      setHints(toActiveHints(assignments, visibleByIdRef.current));
    };

    const deactivate = () => {
      isActiveRef.current = false;
      bufferRef.current = "";
      resetColumnTimeBurst();
      focusedJumpEventIdRef.current = null;
      clearHints();
      eventJumpActions.setPointerDraftIntent(null);
      eventJumpActions.setActive(false);
    };

    const focusEvent = (eventId: string) => {
      focusedJumpEventIdRef.current = eventId;
      const target = visibleByIdRef.current.get(eventId);
      if (!target) return;
      target.element.scrollIntoView({ block: "nearest" });
      focusRef.current(target);
    };

    const commitFocus = (eventId: string, dayKey: string, buffer: string) => {
      clearAmbiguousCommitTimer();
      // Do not resetColumnTimeBurst here. Unique ordinals (w1, f4) are also
      // valid HHMM prefixes. W then 1230 on a column with one event
      // unique-matches on the leading 1; clearing the burst would drop that
      // digit and 230 would not auto-commit as 12:30 (#3078). Enter is gated
      // on focusedJumpEventIdRef instead, so f4 then Enter opens the event
      // rather than committing leftover "4" as 4am.
      eventJumpActions.setActiveDayKeys([dayKey]);
      focusEvent(eventId);
      // Keep the day prefix so the next digit indexes within the same day.
      const dayPrefix = buffer.replace(/\d+$/, "") || buffer;
      bufferRef.current = dayPrefix;
      publishFiltered(dayPrefix);
    };

    const scheduleAmbiguousCommit = (
      eventId: string,
      dayKey: string,
      buffer: string,
    ) => {
      clearAmbiguousCommitTimer();
      ambiguousCommitTimerRef.current = setTimeout(() => {
        ambiguousCommitTimerRef.current = null;
        if (!isActiveRef.current) return;
        if (bufferRef.current !== buffer) return;
        commitFocus(eventId, dayKey, buffer);
      }, DIGIT_AMBIGUOUS_COMMIT_MS);
    };

    const applyMatch = (match: NonNullable<DayJumpMatchResult>) => {
      if (match.kind === "prefix") {
        bufferRef.current = match.buffer;
        eventJumpActions.setActiveDayKeys(
          match.dayKeys,
          match.buffer === "s" ? "Sunday or Saturday" : undefined,
        );
        publishFiltered(match.buffer);
        if (match.pendingExactEventId) {
          const exact = assignmentsRef.current.find(
            (assignment) => assignment.eventId === match.pendingExactEventId,
          );
          if (exact) {
            // The advertised token plus Enter should not wait 400ms just
            // because a longer sibling exists (W2 vs W20).
            if (
              exact.eventId === useEventJumpStore.getState().pointerHintEventId
            ) {
              commitFocus(exact.eventId, exact.dayKey, match.buffer);
            } else {
              scheduleAmbiguousCommit(
                exact.eventId,
                exact.dayKey,
                match.buffer,
              );
            }
          }
        } else {
          clearAmbiguousCommitTimer();
        }
        return;
      }

      if (match.kind === "selectDay") {
        clearAmbiguousCommitTimer();
        resetColumnTimeBurst();
        bufferRef.current = match.buffer;
        shortcutHintProgressActions.demonstrate("week-day-focus");
        recordHandledShortcutInvocation("focus-week-day");
        const dayName = dayNameForPrefix(match.dayPrefix);
        eventJumpActions.setActiveDayKeys(
          [match.dayKey],
          `${dayName} selected`,
        );
        // Keep chips for the selected day so a following digit can refine.
        publishFiltered(match.dayPrefix);
        const pointerHintEventId =
          useEventJumpStore.getState().pointerHintEventId;
        const keepClickedEvent =
          !!pointerHintEventId &&
          assignmentsRef.current.some(
            (item) =>
              item.eventId === pointerHintEventId &&
              item.dayKey === match.dayKey,
          );
        if (!keepClickedEvent && match.firstEventId) {
          focusEvent(match.firstEventId);
        }
        return;
      }

      commitFocus(match.eventId, match.dayKey, match.buffer);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // Armed `e`… sequences own the follow key (`t` title vs Tuesday). Check
      // in both on and off states: jump stays on after focusing a card, and
      // the two capture listeners can register in either order.
      if (isEditSequenceArmed()) return;

      // The series-scope toast owns 1 (following) and 2 (all). Leave those
      // keys unclaimed so RecurrenceScopeOpportunityHost can promote, including
      // while jump-mode column digits would otherwise seed a 1:00/2:00 draft.
      if (isRecurrenceScopeAskReady() && recurrenceScopeForToastDigit(event)) {
        return;
      }

      if (!isActiveRef.current) {
        if (isAppLocked() || isEditableKeyboardTarget(event)) return;

        // An empty-grid click parks a short-lived teaching target. Escape and
        // calendar navigation abandon it without claiming the key - the digits
        // themselves are read by the quick-time consumer below.
        if (useEventJumpStore.getState().pointerDraftDateKey) {
          const inputKey = normalizedKeyboardKey(event);
          const isViewNavigation =
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            ["j", "k", "t"].includes(inputKey);
          if (event.key === "Escape" || isViewNavigation) {
            eventJumpActions.setPointerDraftIntent(null);
          }
        }

        if (tryQuickTimeKey(event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (isBareLetterKey(event, KEYMAP.eventJump.bareLetter)) {
          event.preventDefault();
          event.stopPropagation();
          activate();
          if (isActiveRef.current) {
            keyupSwallow.add(KEYMAP.eventJump.bareLetter);
            recordHandledShortcutInvocation("focus-shift-hold");
          }
          return;
        }

        // Shift+day enters jump mode straight onto that column. Any other
        // shifted letter (Shift+J, Shift+C) falls through to its own handler.
        const key = normalizedKeyboardKey(event);
        if (!isShiftedSingleChar(event)) return;

        const match = matchDayJumpKeystroke({
          assignments: rebuildAssignments(),
          dayKeyByPrefix: dayKeyByPrefix(),
          key,
          buffer: "",
        });
        if (!match) return;

        event.preventDefault();
        event.stopPropagation();
        activate();
        if (!isActiveRef.current) return;
        keyupSwallow.add(key);
        applyMatch(match);
        return;
      }

      if (isAppLocked() || isEditableKeyboardTarget(event)) {
        deactivate();
        return;
      }

      // Empty buffer: digits are times. Once a day letter is typed ("w"),
      // 1-2 digits still index that day's events. A four-digit HHMM still
      // creates on the selected column so focusing Tuesday then 1230 lands
      // there instead of today. Enter after an ordinal focus opens that
      // event; it does not commit the leftover hour digit as a draft.
      if (bufferRef.current === "" && tryQuickTimeKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        event.key === "Enter" &&
        recentColumnTimeDigits() &&
        bufferRef.current !== ""
      ) {
        if (focusedJumpEventIdRef.current) {
          resetColumnTimeBurst();
        } else {
          eventJumpActions.setQuickTimeDigits(recentColumnTimeDigits());
          commitQuickTime();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (event.key === "Escape") {
        if (isHigherEscapeOwner()) return;
        event.preventDefault();
        event.stopPropagation();
        deactivate();
        return;
      }

      // Arrows keep mode on so letter-then-arrows can move focus.
      if (keyboardKey(event).startsWith("Arrow")) {
        clearAmbiguousCommitTimer();
        resetColumnTimeBurst();
        stripDigitBuffer();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = normalizedKeyboardKey(event);
      if (key.length !== 1) return;

      const pickIndex = digitPickIndex(event);
      const daySelected =
        useEventJumpStore.getState().activeDayKeys.length === 1;
      if (daySelected && pickIndex !== null && pickIndex < DIGIT_PICK_COUNT) {
        const at = performance.now();
        columnTimeBurstRef.current = [
          ...columnTimeBurstRef.current.filter(
            (entry) => at - entry.at < DIGIT_AMBIGUOUS_COMMIT_MS * 2,
          ),
          { digit: PICK_KEY_LABELS[pickIndex], at },
        ];
        const burst = columnTimeBurstRef.current
          .map((entry) => entry.digit)
          .join("");
        if (!canQuickTimeBufferGrow(burst)) {
          eventJumpActions.setQuickTimeDigits(burst);
          commitQuickTime();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      // Swallow j/k and other unmatched printable shortcuts while jump is on.
      const match = matchDayJumpKeystroke({
        assignments: assignmentsRef.current,
        dayKeyByPrefix: dayKeyByPrefix(),
        key,
        buffer: bufferRef.current,
      });

      if (!match) {
        if (pickIndex !== null && recentColumnTimeDigits()) {
          clearAmbiguousCommitTimer();
          event.preventDefault();
          event.stopPropagation();
          keyupSwallow.add(key);
          return;
        }
        clearAmbiguousCommitTimer();
        stripDigitBuffer();
        // `e` is not a day prefix. Leave it unclaimed so a later-registered
        // edit-sequence listener can still arm (`e` then `t` on a focused
        // event). `c` / Shift+C pass too: the create owners read the selected
        // column on keyup and then turn jump off. Other unmatched letters
        // stay swallowed so j/k cannot fire.
        if (
          key === KEYMAP.editTitle.sequence.leader ||
          key === KEYMAP.createEvent.hotkey.toLowerCase()
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        keyupSwallow.add(key);
        if (key === KEYMAP.eventJump.bareLetter) {
          deactivate();
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      keyupSwallow.add(key);
      applyMatch(match);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keyupSwallow.consume(event);
    };

    const onBlur = () => {
      if (isActiveRef.current) deactivate();
    };

    const onPointerEventJumpRequest = (event: Event) => {
      if (isAppLocked()) return;
      const eventId = pointerEventJumpId(event);
      if (!eventId) return;
      const assignments = rebuildAssignments();
      const assignment = assignments.find((item) => item.eventId === eventId);
      if (!assignment) return;

      isActiveRef.current = true;
      bufferRef.current = "";
      eventJumpActions.setActive(true);
      eventJumpActions.setActiveDayKeys([assignment.dayKey]);
      eventJumpActions.setPointerHint({
        eventId: assignment.eventId,
        key: assignment.hint.toUpperCase(),
      });
      setHints(toActiveHints(assignments, visibleByIdRef.current));
      // Focus now so the advertised Enter path works, including when this
      // token is a prefix of a longer sibling (W2 vs W20) that would otherwise
      // wait 400ms before focusing.
      focusEvent(eventId);
    };

    const onPointerGridCreateRequest = (event: Event) => {
      const intent = pointerGridIntent(event);
      if (!intent) return;
      eventJumpActions.setPointerDraftIntent(intent);
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener(
      POINTER_EVENT_JUMP_REQUEST,
      onPointerEventJumpRequest,
    );
    document.addEventListener(
      POINTER_GRID_CREATE_REQUEST,
      onPointerGridCreateRequest,
    );

    return () => {
      clearAmbiguousCommitTimer();
      resetQuickTime();
      keyupSwallow.clear();
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener(
        POINTER_EVENT_JUMP_REQUEST,
        onPointerEventJumpRequest,
      );
      document.removeEventListener(
        POINTER_GRID_CREATE_REQUEST,
        onPointerGridCreateRequest,
      );
      eventJumpActions.setPointerDraftIntent(null);
      if (isActiveRef.current) {
        eventJumpActions.reset();
      }
    };
  }, []);

  // Rebuild chips when the event set changes while mode is on. Uses refs for
  // listVisible so an inline callback identity does not loop setState.
  const eventIdsKey = [...allDayEvents, ...timedEvents]
    .map((event) => event._id ?? "")
    .join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: eventIdsKey re-runs this when the event set changes; the contents come from refs
  useEffect(() => {
    if (!isActive) {
      // External resets clear the store without going through deactivate();
      // drop local chips/buffer to match.
      bufferRef.current = "";
      focusedJumpEventIdRef.current = null;
      assignmentsRef.current = [];
      visibleByIdRef.current = new Map();
      setHints([]);
      return;
    }
    const { assignments, visibleById } = buildDayJumpAssignments(
      listVisibleRef.current(),
      [...allDayEventsRef.current, ...timedEventsRef.current],
    );
    assignmentsRef.current = assignments;
    visibleByIdRef.current = visibleById;
    const pointerHintEventId = useEventJumpStore.getState().pointerHintEventId;
    if (pointerHintEventId) {
      const assignment = assignments.find(
        (item) => item.eventId === pointerHintEventId,
      );
      if (!assignment) {
        eventJumpActions.setPointerHint(null);
      } else {
        const nextKey = assignment.hint.toUpperCase();
        if (nextKey !== useEventJumpStore.getState().pointerHintKey) {
          eventJumpActions.setPointerHint({
            eventId: assignment.eventId,
            key: nextKey,
          });
        }
      }
    }
    const source = bufferRef.current
      ? filterHintsByPrefix(assignments, bufferRef.current)
      : assignments;
    setHints(toActiveHints(source, visibleById));
  }, [eventIdsKey, isActive]);

  // Publish the day columns a letter can select, so the sidebar tip only
  // teaches a keystroke that lands somewhere. Every visible column qualifies:
  // an empty one still takes `c` and typed times.
  const visibleDaysKey = visibleDays
    .map((day) => day.format(YEAR_MONTH_DAY_FORMAT))
    .join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleDaysKey re-runs this when the columns change; the contents come from refs
  useEffect(() => {
    const next = dayJumpPrefixesForWeekdays(
      visibleDaysRef.current.map((day) => day.day()),
    );
    publishedPrefixesRef.current = next;
    eventJumpActions.setJumpableDayPrefixes(next);
  }, [visibleDaysKey]);

  // Only clear what this grid published: switching Day -> Week can mount the
  // new grid before the old one unmounts, and a blind clear there would blank
  // the incoming view's columns for the rest of the session.
  useEffect(
    () => () => {
      const published = publishedPrefixesRef.current;
      const current = useEventJumpStore.getState().jumpableDayPrefixes;
      const isOurs =
        current.length === published.length &&
        current.every((prefix, i) => prefix === published[i]);
      if (isOurs) eventJumpActions.setJumpableDayPrefixes([]);
    },
    [],
  );

  return { hints };
}
