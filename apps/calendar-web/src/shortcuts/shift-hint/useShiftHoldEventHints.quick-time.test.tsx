import { act, cleanup, renderHook } from "@testing-library/react";
import { type EventId, EventIdSchema } from "@core/types/domain-primitives";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import * as Track from "@web/auth/posthog/track";
import { type GridEvent } from "@web/common/types/web.event.types";
import { recurrenceScopeOpportunityActions } from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { DIGIT_PICK_OWNER_ATTRIBUTE } from "@web/shortcuts/digit-pick.util";
import {
  clearFloatingLayerReasons,
  setFloatingLayerReason,
} from "@web/shortcuts/floating-layer";
import {
  DAY_JUMP_PREFIX_BY_WEEKDAY,
  type DayJumpWeekday,
  DIGIT_AMBIGUOUS_COMMIT_MS,
} from "@web/shortcuts/shift-hint/assign-shift-hint-keys";
import {
  eventJumpActions,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { useShiftHoldEventHints } from "@web/shortcuts/shift-hint/useShiftHoldEventHints";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const TARGET_DAY = dayjs().startOf("day");
/** The Sunday-to-Saturday week around TARGET_DAY; every fixture below sits in it. */
const VISIBLE_DAYS = Array.from({ length: 7 }, (_, index) =>
  TARGET_DAY.day(0).add(index, "day"),
);

const beginSeriesAsk = () =>
  recurrenceScopeOpportunityActions.begin({
    kind: "delete",
    original: createMockEvent({
      recurrence: {
        kind: "occurrence",
        seriesId: "0123456789abcdef11111111" as EventId,
      },
    }),
    source: "local",
  });

const keydown = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  });

/** Digits are matched by physical code, so a digit press must carry one. */
const digit = (value: string) => keydown(value, { code: `Digit${value}` });

const dispatch = (event: KeyboardEvent) => {
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
};

const mountOwner = () => {
  const createAt = mock((_start: Dayjs) => {});
  renderHook(() =>
    useShiftHoldEventHints({
      createAtTime: (start) => createAt(start),
      focus: () => {},
      getQuickTimeDay: () => TARGET_DAY,
      listVisible: () => [],
      timedEvents: [],
      visibleDays: VISIBLE_DAYS,
    }),
  );

  const type = (keys: string[]) => {
    for (const key of keys) dispatch(digit(key));
  };

  return { createAt, type };
};

const startedAt = (createAt: ReturnType<typeof mock>) =>
  (createAt.mock.calls[0]?.[0] as Dayjs | undefined)?.format("HH:mm") ?? null;

describe("typed-time ownership", () => {
  beforeEach(() => {
    clearAppLockReasons();
    clearFloatingLayerReasons();
    eventJumpActions.reset();
    recurrenceScopeOpportunityActions.reset();
  });

  afterEach(() => {
    cleanup();
    clearAppLockReasons();
    clearFloatingLayerReasons();
    eventJumpActions.reset();
    recurrenceScopeOpportunityActions.reset();
  });

  it("creates on the fourth digit, which cannot grow further", () => {
    const { createAt, type } = mountOwner();

    type(["1", "7", "0", "0"]);

    expect(createAt).toHaveBeenCalledTimes(1);
    expect(startedAt(createAt)).toBe("17:00");
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
  });

  it("records create-typed-time once per commit, not once per digit", () => {
    const track = spyOn(Track, "track");
    const { createAt, type } = mountOwner();

    type(["1", "7", "0", "0"]);

    expect(createAt).toHaveBeenCalledTimes(1);
    const recorded = track.mock.calls.filter(
      ([name, props]) =>
        name === "shortcut_invoked" &&
        (props as { shortcut_id?: string }).shortcut_id === "create-typed-time",
    );
    expect(recorded).toHaveLength(1);
    track.mockRestore();
  });

  it("creates at noon when 1200 is typed", () => {
    const { createAt, type } = mountOwner();

    type(["1", "2", "0", "0"]);

    expect(createAt).toHaveBeenCalledTimes(1);
    expect(startedAt(createAt)).toBe("12:00");
  });

  it("consumes each digit so it reaches no other handler", () => {
    mountOwner();

    const event = dispatch(digit("1"));

    expect(event.defaultPrevented).toBe(true);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("1");
  });

  it("commits a short sequence on Enter without waiting", () => {
    const { createAt, type } = mountOwner();

    type(["1", "7"]);
    const event = dispatch(keydown("Enter"));

    expect(event.defaultPrevented).toBe(true);
    expect(startedAt(createAt)).toBe("17:00");
  });

  it("abandons the sequence on Escape", () => {
    const { createAt, type } = mountOwner();

    type(["1", "7"]);
    const event = dispatch(keydown("Escape"));

    expect(event.defaultPrevented).toBe(true);
    expect(createAt).not.toHaveBeenCalled();
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
  });

  it("leaves Escape alone when nothing is buffered", () => {
    mountOwner();

    const event = dispatch(keydown("Escape"));

    expect(event.defaultPrevented).toBe(false);
  });

  it("lets another command run after abandoning a half-typed time", () => {
    const { createAt, type } = mountOwner();

    type(["1", "1"]);
    const event = dispatch(keydown("h"));

    expect(event.defaultPrevented).toBe(true);
    expect(createAt).not.toHaveBeenCalled();
    expect(useEventJumpStore.getState()).toMatchObject({
      isActive: true,
      quickTimeDigits: "",
    });
  });

  it("ignores a bare Shift so shifted digit layouts still buffer", () => {
    const { type } = mountOwner();

    type(["1"]);
    const event = dispatch(keydown("Shift", { shiftKey: true }));

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("1");
  });

  it("stands down while the app is locked", () => {
    mountOwner();

    setAppLockReason("commandPalette", true);
    const event = dispatch(digit("1"));

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
  });

  it("stands down while a floating layer owns the keyboard", () => {
    mountOwner();

    setFloatingLayerReason("contextMenu", true);
    const event = dispatch(digit("1"));

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
  });

  it("leaves a digit pressed inside a digit-pick list to that list", () => {
    const { createAt } = mountOwner();
    const list = document.createElement("section");
    list.setAttribute(DIGIT_PICK_OWNER_ATTRIBUTE, "");
    const row = document.createElement("button");
    list.appendChild(row);
    document.body.appendChild(list);
    row.focus();

    const event = digit("1");
    act(() => {
      row.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
    expect(createAt).not.toHaveBeenCalled();
    list.remove();
  });

  it("still claims a digit pressed on a focused button outside any list", () => {
    mountOwner();
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    const event = digit("1");
    act(() => {
      button.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("1");
    button.remove();
  });

  it("ignores a Mod chord, which belongs to page jump", () => {
    mountOwner();

    const event = dispatch(keydown("1", { code: "Digit1", metaKey: true }));

    expect(event.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
  });

  it("leaves 1 and 2 unclaimed while the series-scope toast is live", () => {
    beginSeriesAsk();
    const { createAt } = mountOwner();

    const one = dispatch(digit("1"));
    expect(one.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
    expect(createAt).not.toHaveBeenCalled();

    const two = dispatch(digit("2"));
    expect(two.defaultPrevented).toBe(false);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("");
    expect(createAt).not.toHaveBeenCalled();
  });

  it("still claims other digits while the series-scope toast is live", () => {
    beginSeriesAsk();
    mountOwner();

    const event = dispatch(digit("3"));

    expect(event.defaultPrevented).toBe(true);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("3");
  });

  it("claims 1 again after the series-scope toast is dismissed", () => {
    const id = beginSeriesAsk();
    mountOwner();
    recurrenceScopeOpportunityActions.dismiss(id);

    const event = dispatch(digit("1"));

    expect(event.defaultPrevented).toBe(true);
    expect(useEventJumpStore.getState().quickTimeDigits).toBe("1");
  });

  it("keeps digit precedence while event jump is active with no day prefix", () => {
    mountOwner();
    dispatch(keydown("h"));

    const event = dispatch(digit("1"));

    expect(event.defaultPrevented).toBe(true);
    expect(useEventJumpStore.getState()).toMatchObject({
      isActive: true,
      quickTimeDigits: "1",
    });
  });
});

describe("typed-time deferred commit", () => {
  afterEach(() => {
    cleanup();
    eventJumpActions.reset();
  });

  it("commits a still-growable sequence once the window lapses", async () => {
    const { createAt, type } = mountOwner();

    type(["0"]);
    expect(createAt).not.toHaveBeenCalled();

    await act(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, DIGIT_AMBIGUOUS_COMMIT_MS + 50);
        }),
    );

    expect(startedAt(createAt)).toBe("00:00");
  });

  describe("with an empty-grid click parked", () => {
    const CLICKED_DAY = TARGET_DAY.add(2, "day");

    const parkIntent = (timeKey: string, hour: number) =>
      eventJumpActions.setPointerDraftIntent({
        date: CLICKED_DAY.format("YYYY-MM-DD"),
        start: CLICKED_DAY.hour(hour).minute(30).format(),
        timeKey,
      });

    it("lands on the clicked instant, not a re-resolved one", () => {
      parkIntent("1130", 23);
      const { createAt, type } = mountOwner();

      type(["1", "1", "3", "0"]);

      expect(startedAt(createAt)).toBe("23:30");
      expect(useEventJumpStore.getState().pointerDraftDateKey).toBeNull();
    });

    it("retargets a different sequence to the clicked day", () => {
      parkIntent("1130", 23);
      const { createAt, type } = mountOwner();

      type(["1", "7", "0", "0"]);

      const start = createAt.mock.calls[0]?.[0] as Dayjs;
      expect(start.format("YYYY-MM-DD HH:mm")).toBe(
        `${CLICKED_DAY.format("YYYY-MM-DD")} 17:00`,
      );
    });
  });

  describe("with a jump-selected column", () => {
    const COLUMN_EVENT_ID = EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa");
    const COLUMN_DAY =
      TARGET_DAY.day() === 3 ? TARGET_DAY.add(1, "day") : TARGET_DAY.day(3);
    const columnLetter =
      DAY_JUMP_PREFIX_BY_WEEKDAY[COLUMN_DAY.day() as DayJumpWeekday];

    const mountColumn = () => {
      const createAt = mock((_start: Dayjs) => {});
      const event = {
        _id: COLUMN_EVENT_ID,
        startDate: COLUMN_DAY.hour(9).format(),
        endDate: COLUMN_DAY.hour(10).format(),
        title: "Column event",
        isAllDay: false,
      } as unknown as GridEvent;
      const el = document.createElement("button");
      el.textContent = COLUMN_EVENT_ID;
      document.body.appendChild(el);

      renderHook(() =>
        useShiftHoldEventHints({
          createAtTime: (start) => createAt(start),
          focus: () => {},
          getQuickTimeDay: () => TARGET_DAY,
          listVisible: () => [
            { eventId: COLUMN_EVENT_ID, eventType: "timed", element: el },
          ],
          timedEvents: [event],
          visibleDays: VISIBLE_DAYS,
        }),
      );

      const type = (keys: string[]) => {
        for (const key of keys) dispatch(digit(key));
      };

      return { createAt, type };
    };

    it("creates 1230 on the focused day, not today", () => {
      const { createAt, type } = mountColumn();

      act(() => {
        dispatch(
          keydown(columnLetter.toUpperCase(), {
            shiftKey: true,
          }),
        );
        type(["1", "2", "3", "0"]);
        dispatch(keydown("Enter"));
      });

      const start = createAt.mock.calls[0]?.[0] as Dayjs;
      expect(createAt).toHaveBeenCalledTimes(1);
      expect(start.format("YYYY-MM-DD HH:mm")).toBe(
        `${COLUMN_DAY.format("YYYY-MM-DD")} 12:30`,
      );
    });

    it("still toggles jump off with h after a half-typed column time", () => {
      const { createAt, type } = mountColumn();

      act(() => {
        dispatch(
          keydown(columnLetter.toUpperCase(), {
            shiftKey: true,
          }),
        );
        type(["9"]);
        dispatch(keydown("h"));
      });

      expect(createAt).not.toHaveBeenCalled();
      expect(useEventJumpStore.getState().isActive).toBe(false);
    });
  });

  describe("with a Friday column of four events", () => {
    const FRIDAY = TARGET_DAY.day() === 5 ? TARGET_DAY : TARGET_DAY.day(5);
    const fridayIds = [1, 2, 3, 4].map((n) =>
      EventIdSchema.parse(`f${"a".repeat(23)}${n}`),
    );
    const fridayElements: HTMLButtonElement[] = [];

    const mountFriday = () => {
      const createAt = mock((_start: Dayjs) => {});
      const openEvent = mock((_eventId: string) => {});
      const events = fridayIds.map((id, index) => {
        const hour = 9 + index * 2;
        return {
          _id: id,
          startDate: FRIDAY.hour(hour).format(),
          endDate: FRIDAY.hour(hour + 1).format(),
          title: `Friday ${index + 1}`,
          isAllDay: false,
        } as unknown as GridEvent;
      });

      fridayElements.splice(0, fridayElements.length);
      for (const id of fridayIds) {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = id;
        el.dataset.eventId = id;
        el.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          openEvent(id);
        });
        document.body.appendChild(el);
        fridayElements.push(el);
      }

      renderHook(() =>
        useShiftHoldEventHints({
          createAtTime: (start) => createAt(start),
          focus: (target) => {
            target.element.focus();
          },
          getQuickTimeDay: () => TARGET_DAY,
          listVisible: () =>
            fridayIds.map((eventId, index) => ({
              eventId,
              eventType: "timed" as const,
              element: fridayElements[index]!,
            })),
          timedEvents: events,
          visibleDays: VISIBLE_DAYS,
        }),
      );

      const pressFriday = () => {
        dispatch(keydown("F", { shiftKey: true }));
      };

      return { createAt, openEvent, pressFriday };
    };

    afterEach(() => {
      for (const el of fridayElements) {
        el.remove();
      }
      fridayElements.splice(0, fridayElements.length);
    });

    it("opens the fourth Friday event on f then 4 then Enter, with no draft", () => {
      const { createAt, openEvent, pressFriday } = mountFriday();
      const fourthId = fridayIds[3]!;
      const fourthEl = fridayElements[3]!;

      pressFriday();
      dispatch(digit("4"));
      const enter = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
      });
      act(() => {
        fourthEl.dispatchEvent(enter);
      });

      expect(document.activeElement).toBe(fourthEl);
      expect(enter.defaultPrevented).toBe(true);
      expect(openEvent).toHaveBeenCalledTimes(1);
      expect(openEvent).toHaveBeenCalledWith(fourthId);
      expect(createAt).not.toHaveBeenCalled();
    });

    it("opens the fourth Friday event on f then 4 after the burst window, with no draft", async () => {
      const { createAt, openEvent, pressFriday } = mountFriday();
      const fourthId = fridayIds[3]!;
      const fourthEl = fridayElements[3]!;

      pressFriday();
      dispatch(digit("4"));

      await act(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, DIGIT_AMBIGUOUS_COMMIT_MS * 2 + 50);
          }),
      );

      const enter = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
      });
      act(() => {
        fourthEl.dispatchEvent(enter);
      });

      expect(document.activeElement).toBe(fourthEl);
      expect(openEvent).toHaveBeenCalledTimes(1);
      expect(openEvent).toHaveBeenCalledWith(fourthId);
      expect(createAt).not.toHaveBeenCalled();
    });
  });
});
