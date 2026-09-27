import { act, cleanup, renderHook } from "@testing-library/react";
import { EventIdSchema } from "@core/types/domain-primitives";
import dayjs from "@core/util/date/dayjs";
import { dispatchMissingKey } from "@web/__tests__/utils/keyboard.test.util";
import { type GridEvent } from "@web/common/types/web.event.types";
import { WEEK_INTERACTION_EVENT_ID_ATTRIBUTE } from "@web/grid/interaction/view-event-registry";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { requestPointerEventJump } from "@web/shortcuts/keyboard-only/pointer-grid-bridge";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  eventJumpActions,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { useShiftHoldEventHints } from "@web/shortcuts/shift-hint/useShiftHoldEventHints";
import { getShortcutHintProgress } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import {
  resetEditSequenceArm,
  useEditSequenceShortcut,
} from "@web/shortcuts/useEditSequenceShortcut";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const EVENT_A = EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa");
const EVENT_B = EventIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbb");
const EVENT_C = EventIdSchema.parse("cccccccccccccccccccccccc");
const EVENT_D = EventIdSchema.parse("dddddddddddddddddddddddd");
/** Sunday 2026-08-02 through Saturday 2026-08-08, the week the fixtures use. */
const WEEK_DAYS = Array.from({ length: 7 }, (_, index) =>
  dayjs("2026-08-02").add(index, "day"),
);

const dispatch = (
  type: "keydown" | "keyup",
  key: string,
  init: KeyboardEventInit = {},
) => {
  document.dispatchEvent(
    new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      key,
      ...init,
    }),
  );
};

/** The idle entry gesture: Shift + the day letter (browsers report it upper). */
const pressDayJump = (letter: string) => {
  dispatch("keydown", letter.toUpperCase(), { shiftKey: true });
  dispatch("keyup", letter.toUpperCase(), { shiftKey: true });
};

const pressEventJump = () => {
  dispatch("keydown", KEYMAP.eventJump.bareLetter);
  dispatch("keyup", KEYMAP.eventJump.bareLetter);
};

const timedFixture = (id: string, startDate: string): GridEvent =>
  ({
    _id: id,
    startDate,
    endDate: startDate,
    title: id,
    isAllDay: false,
  }) as GridEvent;

describe("useShiftHoldEventHints", () => {
  beforeEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
    resetEditSequenceArm();
  });

  afterEach(() => {
    cleanup();
    clearAppLockReasons();
    eventJumpActions.reset();
    resetEditSequenceArm();
    document.body.innerHTML = "";
  });

  const mountHints = (timedEvents?: GridEvent[]) => {
    const focus = mock((_target: { eventId: string }) => {});
    const events = timedEvents ?? [
      timedFixture(EVENT_A, "2026-08-05T09:00:00.000Z"),
      timedFixture(EVENT_B, "2026-08-05T11:00:00.000Z"),
      timedFixture(EVENT_C, "2026-08-06T13:00:00.000Z"),
    ];
    const ids = events.map((event) => event._id as string);
    const elements = ids.map((id) => {
      const el = document.createElement("button");
      el.textContent = id;
      el.getBoundingClientRect = () =>
        ({
          x: 40,
          y: 80,
          top: 80,
          left: 40,
          bottom: 110,
          right: 200,
          width: 160,
          height: 30,
          toJSON: () => ({}),
        }) as DOMRect;
      document.body.appendChild(el);
      return el;
    });

    const { result } = renderHook(() =>
      useShiftHoldEventHints({
        createAtTime: () => {},
        focus: (target) => focus(target),
        getQuickTimeDay: () => dayjs("2026-08-05"),
        listVisible: () =>
          ids.map((id, index) => ({
            eventId: id,
            eventType: "timed" as const,
            element: elements[index]!,
          })),
        timedEvents: events,
        visibleDays: WEEK_DAYS,
      }),
    );

    return { focus, result, elements, ids };
  };

  it("toggles hints on h and focuses via day prefix", () => {
    const { focus, result, elements } = mountHints();

    act(() => {
      pressEventJump();
    });

    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(result.current.hints.map((hint) => hint.hint)).toEqual([
      "w1",
      "w2",
      "r1",
    ]);
    expect(useEventJumpStore.getState().announcement).toBe("Event jump on");

    act(() => {
      dispatch("keydown", "w");
    });

    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_A, element: elements[0] }),
    );
    expect(useEventJumpStore.getState().activeDayKeys).toEqual(["2026-08-05"]);
    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(getShortcutHintProgress()).toContain("week-day-focus");

    act(() => {
      dispatch("keydown", "2");
    });

    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_B, element: elements[1] }),
    );
    expect(useEventJumpStore.getState().isActive).toBe(true);
  });

  it("focuses a day prefix with Shift and the day letter", () => {
    const { focus, result, elements } = mountHints();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "W",
      shiftKey: true,
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_A, element: elements[0] }),
    );
    expect(useEventJumpStore.getState().activeDayKeys).toEqual(["2026-08-05"]);
    expect(result.current.hints.map((hint) => hint.hint)).toEqual(["w1", "w2"]);
  });

  it("refines a Shift-entered day prefix with a following digit", () => {
    const { focus, elements } = mountHints();

    act(() => {
      pressDayJump("w");
      dispatch("keydown", "2");
    });

    expect(focus).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ eventId: EVENT_A, element: elements[0] }),
    );
    expect(focus).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventId: EVENT_B, element: elements[1] }),
    );
    expect(useEventJumpStore.getState().isActive).toBe(true);
  });

  it("selects an empty day from idle without focusing anything", () => {
    const { focus } = mountHints([
      timedFixture(EVENT_C, "2026-08-06T13:00:00.000Z"),
    ]);

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "W",
      shiftKey: true,
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(useEventJumpStore.getState().activeDayKeys).toEqual(["2026-08-05"]);
    expect(useEventJumpStore.getState().announcement).toBe(
      "Wednesday selected",
    );
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not claim a day letter for a column that is not visible", () => {
    const { focus, result } = mountHints([
      timedFixture(EVENT_C, "2026-08-06T13:00:00.000Z"),
    ]);
    cleanup();
    renderHook(() =>
      useShiftHoldEventHints({
        createAtTime: () => {},
        focus: (target) => focus(target),
        getQuickTimeDay: () => dayjs("2026-08-06"),
        listVisible: () => [],
        timedEvents: [],
        visibleDays: [dayjs("2026-08-06")],
      }),
    );

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "W",
      shiftKey: true,
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    expect(result.current.hints).toEqual([]);
  });

  it("leaves c and Shift+C unclaimed while a day is selected", () => {
    mountHints();

    act(() => {
      pressDayJump("w");
    });
    expect(useEventJumpStore.getState().activeDayKeys).toEqual(["2026-08-05"]);

    for (const shiftKey of [false, true]) {
      const down = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: shiftKey ? "C" : "c",
        shiftKey,
      });
      const up = new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key: shiftKey ? "C" : "c",
        shiftKey,
      });
      act(() => {
        document.dispatchEvent(down);
        document.dispatchEvent(up);
      });
      expect(down.defaultPrevented).toBe(false);
      expect(up.defaultPrevented).toBe(false);
    }
    // The create owner, not this hook, spends the selection.
    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(useEventJumpStore.getState().activeDayKeys).toEqual(["2026-08-05"]);
  });

  it("routes a bare digit to typed-time creation while jump is off", () => {
    const { focus } = mountHints();

    act(() => {
      dispatch("keydown", "1");
    });

    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("1");
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not claim t while jump is off so today still works", () => {
    const { focus } = mountHints([
      timedFixture(EVENT_A, "2026-08-04T09:00:00.000Z"),
    ]);

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "t",
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("leaves bare m to the event menu while an event is focused", () => {
    const { focus, elements } = mountHints([
      timedFixture(EVENT_A, "2026-08-03T09:00:00.000Z"),
    ]);
    elements[0]!.setAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, EVENT_A);
    elements[0]!.focus();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "m",
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("claims Shift+M even while a calendar event is focused", () => {
    const { focus, elements } = mountHints([
      timedFixture(EVENT_A, "2026-08-03T09:00:00.000Z"),
    ]);
    elements[0]!.setAttribute(WEEK_INTERACTION_EVENT_ID_ATTRIBUTE, EVENT_A);
    elements[0]!.focus();

    act(() => {
      pressDayJump("m");
    });

    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_A, element: elements[0] }),
    );
  });

  it("claims Shift+T for Tuesday while bare t still goes to today", () => {
    const { focus, elements } = mountHints([
      timedFixture(EVENT_A, "2026-08-04T09:00:00.000Z"),
    ]);

    act(() => {
      pressDayJump("t");
    });

    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_A, element: elements[0] }),
    );
    expect(useEventJumpStore.getState().activeDayKeys).toEqual(["2026-08-04"]);
  });

  it("leaves bare f to notice focus while a notice is visible", () => {
    const { focus } = mountHints([
      timedFixture(EVENT_A, "2026-08-07T09:00:00.000Z"),
    ]);
    const notice = document.createElement("div");
    notice.setAttribute("data-notice", "");
    const button = document.createElement("button");
    button.textContent = "Sign up";
    notice.appendChild(button);
    document.body.appendChild(notice);

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "f",
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("claims Shift+F for Friday", () => {
    const { focus, elements } = mountHints([
      timedFixture(EVENT_A, "2026-08-07T09:00:00.000Z"),
    ]);

    act(() => {
      pressDayJump("f");
    });

    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_A, element: elements[0] }),
    );
  });

  it("does not claim a leaderless jump while typing", () => {
    const { focus } = mountHints();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          composed: true,
          key: "w",
        }),
      );
    });

    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not claim a leaderless jump while app-locked", () => {
    setAppLockReason("test-modal", true);
    const { focus } = mountHints();

    act(() => {
      dispatch("keydown", "w");
    });

    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not claim a mapped e-sequence key while the sequence is armed", () => {
    const onSequence = mock(() => {});
    renderHook(() => useEditSequenceShortcut({ onSequence }));
    const { focus } = mountHints();

    act(() => {
      dispatch("keydown", "e");
      dispatch("keydown", "r");
    });

    expect(onSequence).toHaveBeenCalledWith("recurrence");
    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not claim unmatched letters while jump is off", () => {
    mountHints();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "c",
    });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().isActive).toBe(false);
  });

  it("turns a blocked event click into a directly usable event sequence", () => {
    const { focus, result } = mountHints();

    act(() => {
      requestPointerEventJump(EVENT_B);
    });

    expect(useEventJumpStore.getState()).toMatchObject({
      isActive: true,
      pointerHintKey: "W2",
      pointerHintEventId: EVENT_B,
    });
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_B }),
    );
    expect(result.current.hints.map((hint) => hint.hint)).toEqual([
      "w1",
      "w2",
      "r1",
    ]);

    act(() => {
      dispatch("keydown", "w");
      dispatch("keydown", "2");
    });

    expect(focus).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventId: EVENT_B }),
    );
  });

  it("does not steal focus to the first-of-day while typing a clicked event token", () => {
    const { focus } = mountHints();

    act(() => {
      requestPointerEventJump(EVENT_B);
    });
    focus.mockClear();

    act(() => {
      dispatch("keydown", "w");
    });

    expect(focus).not.toHaveBeenCalled();
    expect(useEventJumpStore.getState().pointerHintEventId).toBe(EVENT_B);
  });

  it("commits a clicked prefix token without waiting for a longer sibling", () => {
    const focus = mock((_target: { eventId: string }) => {});
    const ids = Array.from({ length: 20 }, (_, index) =>
      EventIdSchema.parse(index.toString(16).padStart(24, "c")),
    );
    const clicked = ids[1]!;
    const elements = ids.map((id) => {
      const el = document.createElement("button");
      el.textContent = id;
      document.body.appendChild(el);
      return el;
    });
    const timedEvents = ids.map((id, index) =>
      timedFixture(
        id,
        `2026-08-05T${String(8 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10).padStart(2, "0")}:00.000Z`,
      ),
    );

    renderHook(() =>
      useShiftHoldEventHints({
        createAtTime: () => {},
        focus: (target) => focus(target),
        getQuickTimeDay: () => dayjs("2026-08-05"),
        listVisible: () =>
          ids.map((id, index) => ({
            eventId: id,
            eventType: "timed" as const,
            element: elements[index]!,
          })),
        timedEvents,
        visibleDays: WEEK_DAYS,
      }),
    );

    act(() => {
      requestPointerEventJump(clicked);
    });
    expect(useEventJumpStore.getState().pointerHintKey).toBe("W2");
    focus.mockClear();

    act(() => {
      dispatch("keydown", "w");
      dispatch("keydown", "2");
    });

    expect(focus).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventId: clicked }),
    );
    expect(focus).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventId: ids[0] }),
    );
  });

  it("swallows unmatched letters while jump is active", () => {
    mountHints();

    act(() => {
      requestPointerEventJump(EVENT_B);
    });

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "m",
    });

    act(() => {
      document.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(useEventJumpStore.getState().isActive).toBe(true);
  });

  it("stops swallowing printable keys when jump mode is cleared", () => {
    mountHints();

    act(() => {
      requestPointerEventJump(EVENT_B);
    });
    expect(useEventJumpStore.getState().isActive).toBe(true);

    const whileActive = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "]",
    });
    document.dispatchEvent(whileActive);
    expect(whileActive.defaultPrevented).toBe(true);

    act(() => {
      eventJumpActions.setActive(false);
    });

    const afterClear = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "]",
    });
    document.dispatchEvent(afterClear);
    expect(afterClear.defaultPrevented).toBe(false);
  });

  it("refreshes the pointer hint token when an earlier event appears", () => {
    const focus = mock((_target: { eventId: string }) => {});
    const events = [
      timedFixture(EVENT_A, "2026-08-05T09:00:00.000Z"),
      timedFixture(EVENT_B, "2026-08-05T11:00:00.000Z"),
      timedFixture(EVENT_C, "2026-08-06T13:00:00.000Z"),
    ];
    const elements = [EVENT_A, EVENT_B, EVENT_C, EVENT_D].map((id) => {
      const el = document.createElement("button");
      el.textContent = id;
      document.body.appendChild(el);
      return el;
    });

    const { rerender } = renderHook(
      ({ timedEvents }) =>
        useShiftHoldEventHints({
          createAtTime: () => {},
          focus: (target) => focus(target),
          getQuickTimeDay: () => dayjs("2026-08-05"),
          listVisible: () =>
            timedEvents.flatMap((event) => {
              const index = [EVENT_A, EVENT_B, EVENT_C, EVENT_D].indexOf(
                event._id as typeof EVENT_A,
              );
              if (index < 0) return [];
              return [
                {
                  eventId: event._id as string,
                  eventType: "timed" as const,
                  element: elements[index]!,
                },
              ];
            }),
          timedEvents,
          visibleDays: WEEK_DAYS,
        }),
      { initialProps: { timedEvents: events } },
    );

    act(() => {
      requestPointerEventJump(EVENT_B);
    });
    expect(useEventJumpStore.getState().pointerHintKey).toBe("W2");

    act(() => {
      rerender({
        timedEvents: [
          timedFixture(EVENT_D, "2026-08-05T08:00:00.000Z"),
          ...events,
        ],
      });
    });

    expect(useEventJumpStore.getState().pointerHintKey).toBe("W3");
  });

  it("publishes every visible column as a day key can select empty ones", () => {
    cleanup();
    renderHook(() =>
      useShiftHoldEventHints({
        createAtTime: () => {},
        focus: () => {},
        getQuickTimeDay: () => dayjs("2026-08-05"),
        listVisible: () => [],
        timedEvents: [],
        visibleDays: WEEK_DAYS.slice(3, 6),
      }),
    );

    expect(useEventJumpStore.getState().jumpableDayPrefixes).toEqual([
      "w",
      "r",
      "f",
    ]);
  });

  it("clears the published columns when the grid unmounts", () => {
    mountHints();
    expect(
      useEventJumpStore.getState().jumpableDayPrefixes.length,
    ).toBeGreaterThan(0);

    cleanup();

    expect(useEventJumpStore.getState().jumpableDayPrefixes).toEqual([]);
  });

  it("does not activate on bare Shift or Shift+Tab", () => {
    const { result } = mountHints();

    act(() => {
      dispatch("keydown", "Shift");
      dispatch("keyup", "Shift");
      dispatch("keydown", "Tab", { shiftKey: true });
      dispatch("keyup", "Tab", { shiftKey: true });
    });

    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(result.current.hints).toEqual([]);
  });

  it("does not activate on Shift+J", () => {
    const { result } = mountHints();

    act(() => {
      dispatch("keydown", "Shift");
      dispatch("keydown", "j", { shiftKey: true });
      dispatch("keyup", "j", { shiftKey: true });
      dispatch("keyup", "Shift");
    });

    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(result.current.hints).toEqual([]);
  });

  it("stays inert while app-locked", () => {
    setAppLockReason("test-modal", true);
    const { result } = mountHints();

    act(() => {
      pressEventJump();
    });

    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(result.current.hints).toEqual([]);
  });

  it("clears hints when Escape is pressed", () => {
    const { result } = mountHints();

    act(() => {
      pressEventJump();
    });
    expect(result.current.hints).toHaveLength(3);

    act(() => {
      dispatch("keydown", "Escape");
    });
    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(result.current.hints).toEqual([]);
  });

  it("toggles off with a second h", () => {
    const { result } = mountHints();

    act(() => {
      pressEventJump();
    });
    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(result.current.hints).toHaveLength(3);

    act(() => {
      pressEventJump();
    });
    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(result.current.hints).toEqual([]);
  });

  it("focuses Saturday from idle with Shift+S then a", () => {
    const { focus, elements } = mountHints([
      timedFixture(EVENT_A, "2026-08-02T09:00:00.000Z"),
      timedFixture(EVENT_B, "2026-08-08T11:00:00.000Z"),
    ]);

    act(() => {
      pressDayJump("s");
      dispatch("keydown", "a");
    });

    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_B, element: elements[1] }),
    );
    expect(useEventJumpStore.getState().activeDayKeys).toEqual(["2026-08-08"]);
  });

  it("keeps mode on when arrows are pressed after selecting a day", () => {
    const { focus, result } = mountHints();

    act(() => {
      pressEventJump();
      dispatch("keydown", "w");
    });
    expect(focus).toHaveBeenCalled();
    expect(useEventJumpStore.getState().isActive).toBe(true);

    act(() => {
      dispatch("keydown", "ArrowDown");
    });
    expect(useEventJumpStore.getState().isActive).toBe(true);
    expect(result.current.hints.length).toBeGreaterThan(0);
  });

  it("edits the title with e then t after focusing a Monday event in jump mode", () => {
    const onSequence = mock(() => {});
    renderHook(() => useEditSequenceShortcut({ onSequence }));
    const { focus } = mountHints([
      timedFixture(EVENT_A, "2026-08-03T09:00:00.000Z"),
      timedFixture(EVENT_B, "2026-08-04T09:00:00.000Z"),
    ]);

    act(() => {
      pressEventJump();
      dispatch("keydown", "m");
    });
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_A }),
    );
    focus.mockClear();

    act(() => {
      dispatch("keydown", "e");
      dispatch("keydown", "t");
    });

    expect(onSequence).toHaveBeenCalledWith("title");
    expect(focus).not.toHaveBeenCalled();
    expect(useEventJumpStore.getState().isActive).toBe(false);
  });

  it("edits the title with e then t even when jump's listener is registered first", () => {
    const onSequence = mock(() => {});
    const { focus } = mountHints([
      timedFixture(EVENT_A, "2026-08-03T09:00:00.000Z"),
      timedFixture(EVENT_B, "2026-08-04T09:00:00.000Z"),
    ]);
    renderHook(() => useEditSequenceShortcut({ onSequence }));

    act(() => {
      pressEventJump();
      dispatch("keydown", "m");
      dispatch("keydown", "e");
      dispatch("keydown", "t");
    });

    expect(onSequence).toHaveBeenCalledWith("title");
    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_A }),
    );
    expect(focus).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_B }),
    );
  });

  it("still jumps to Tuesday with t when nothing can arm the edit sequence", () => {
    renderHook(() =>
      useEditSequenceShortcut({
        canArm: () => false,
        onSequence: mock(() => {}),
      }),
    );
    const { focus } = mountHints([
      timedFixture(EVENT_A, "2026-08-03T09:00:00.000Z"),
      timedFixture(EVENT_B, "2026-08-04T09:00:00.000Z"),
    ]);

    act(() => {
      pressEventJump();
      dispatch("keydown", "e");
      dispatch("keydown", "t");
    });

    expect(focus).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_B }),
    );
    expect(useEventJumpStore.getState().isActive).toBe(true);
  });

  it("does not steal s while the e edit sequence is armed", () => {
    const onSequence = mock(() => {});
    renderHook(() => useEditSequenceShortcut({ onSequence }));
    const { result } = mountHints();

    act(() => {
      dispatch("keydown", "e");
      dispatch("keydown", "s");
    });

    expect(onSequence).toHaveBeenCalledWith("start");
    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(result.current.hints).toEqual([]);
  });

  it("ignores KeyboardEvents with no key instead of throwing", () => {
    const { result } = mountHints();

    expect(() => {
      dispatchMissingKey("keydown");
      dispatchMissingKey("keyup");
    }).not.toThrow();

    expect(useEventJumpStore.getState().isActive).toBe(false);
    expect(result.current.hints).toEqual([]);
  });
});
