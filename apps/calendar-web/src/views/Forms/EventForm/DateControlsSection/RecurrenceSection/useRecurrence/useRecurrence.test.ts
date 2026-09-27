import { renderHook } from "@testing-library/react";
import { act, type Dispatch, type SetStateAction } from "react";
import { Frequency } from "rrule";
import { EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraft,
  editGridEventDraft,
  resolveDraftRecurrenceRules,
  suppressedSeriesIdForDraft,
} from "@web/events/grid-event-draft.adapter";
import { useRecurrence } from "./useRecurrence";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const SCHEDULE = EventScheduleSchema.parse({
  kind: "timed",
  start: "2026-05-31T10:00:00.000Z",
  end: "2026-05-31T11:00:00.000Z",
  timeZone: "UTC",
});

const baseDraft = () =>
  createGridEventDraft({
    kind: "timed",
    start: new Date("2026-05-31T10:00:00.000Z"),
    end: new Date("2026-05-31T11:00:00.000Z"),
    timeZone: "UTC",
  });

const mountPreserveOccurrence = (
  seriesRules: string[],
  seriesId = EventIdSchema.parse("0123456789abcdefaaaaaaaa"),
) => {
  const source = createMockEvent({
    schedule: SCHEDULE,
    recurrence: {
      kind: "occurrence",
      seriesId,
    },
  });
  const editedDraft = editGridEventDraft(source);
  if (!editedDraft) throw new Error("expected edit draft");

  expect(editedDraft.values.recurrence).toEqual({ kind: "preserve" });
  expect(suppressedSeriesIdForDraft(editedDraft)).toBeNull();

  let draft: GridEventDraft = editedDraft;
  let setDraftCalls = 0;
  const setDraft: Dispatch<SetStateAction<GridEventDraft | null>> = (
    updater,
  ) => {
    setDraftCalls++;
    const next = typeof updater === "function" ? updater(draft) : updater;
    if (next) draft = next;
  };

  const hook = renderHook(() =>
    useRecurrence(draft, { setDraft }, seriesRules),
  );

  return {
    draft: () => draft,
    setDraftCalls: () => setDraftCalls,
    result: hook.result,
    rerender: hook.rerender,
    assertUntouched: () => {
      expect(setDraftCalls).toBe(0);
      expect(draft.values.recurrence).toEqual({ kind: "preserve" });
      expect(suppressedSeriesIdForDraft(draft)).toBeNull();
    },
  };
};

describe("useRecurrence hook", () => {
  it("initializes with no recurrence", () => {
    const draft = baseDraft();
    const setDraft = mock();
    const { result } = renderHook(() => useRecurrence(draft, { setDraft }));

    expect(result.current.hasRecurrence).toBe(false);
    expect(result.current.interval).toBe(1);
    expect(result.current.freq).toBe(Frequency.DAILY);
    expect(result.current.weekDays).toEqual([]);
    expect(result.current.until).toBeNull();
  });

  it("can toggle recurrence", () => {
    const draft = baseDraft();
    const setDraft = mock();
    const { result } = renderHook(() => useRecurrence(draft, { setDraft }));
    act(() => {
      result.current.toggleRecurrence();
    });
    expect(setDraft).toHaveBeenCalled();
  });

  it("can set interval", () => {
    const draft = baseDraft();
    const setDraft = mock();
    const { result } = renderHook(() => useRecurrence(draft, { setDraft }));

    act(() => {
      result.current.toggleRecurrence();
      result.current.setInterval(3);
    });

    expect(setDraft).toHaveBeenCalled();
    expect(result.current.interval).toBe(3);
  });

  it("can set frequency", () => {
    const draft = baseDraft();
    const setDraft = mock();
    const { result } = renderHook(() => useRecurrence(draft, { setDraft }));

    act(() => {
      result.current.toggleRecurrence();
      result.current.setFreq(Frequency.MONTHLY);
    });

    expect(setDraft).toHaveBeenCalled();
    expect(result.current.freq).toBe(Frequency.MONTHLY);
  });

  it("can set weekDays", () => {
    const draft = baseDraft();
    const setDraft = mock();
    const { result } = renderHook(() => useRecurrence(draft, { setDraft }));

    act(() => {
      result.current.toggleRecurrence();
      result.current.setWeekDays(["monday", "friday"]);
    });

    expect(setDraft).toHaveBeenCalled();
    expect(result.current.weekDays).toEqual(["monday", "friday"]);
  });

  it("can set until date and normalizes to end-of-day", () => {
    const draft = baseDraft();
    const setDraft = mock();
    const { result } = renderHook(() => useRecurrence(draft, { setDraft }));
    const date = new Date("2026-08-13T00:00:00Z");

    act(() => {
      result.current.toggleRecurrence();
      result.current.setUntil(date);
    });

    expect(setDraft).toHaveBeenCalled();
    // setUntil normalizes to end-of-day (23:59:59), not the raw midnight
    expect(result.current.until?.toISOString()).toMatch(/23:59:59/);
  });

  it("can clear until date", () => {
    const draft = baseDraft();
    const setDraft = mock();
    const { result } = renderHook(() => useRecurrence(draft, { setDraft }));

    act(() => {
      result.current.toggleRecurrence();
      result.current.setUntil(new Date());
      result.current.setUntil(null);
    });

    expect(result.current.until).toBeNull();
  });

  it("initializes with recurrence", () => {
    const draft = {
      ...baseDraft(),
      values: {
        ...baseDraft().values,
        recurrence: {
          kind: "series" as const,
          rules: ["RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=5"],
        },
      },
    } as GridEventDraft;

    const setDraft = mock();
    const { result } = renderHook(() => useRecurrence(draft, { setDraft }));

    expect(result.current.hasRecurrence).toBe(true);
    expect(result.current.freq).toBe(Frequency.MONTHLY);
    expect(result.current.interval).toBe(2);
  });

  it("re-seeds local state when series rules arrive after first render", () => {
    const seriesRules = ["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE"];
    const source = createMockEvent({
      schedule: SCHEDULE,
      recurrence: {
        kind: "occurrence",
        seriesId: EventIdSchema.parse("0123456789abcdefaaaaaaaa"),
      },
    });
    const draft = editGridEventDraft(source);
    if (!draft) throw new Error("expected edit draft");

    const setDraft = mock();
    const { result, rerender } = renderHook(
      ({ rules }: { rules?: readonly string[] }) =>
        useRecurrence(draft, { setDraft }, rules),
      { initialProps: { rules: undefined as readonly string[] | undefined } },
    );

    expect(result.current.hasRecurrence).toBe(false);
    expect(result.current.freq).toBe(Frequency.DAILY);

    rerender({ rules: seriesRules });

    expect(result.current.hasRecurrence).toBe(true);
    expect(result.current.freq).toBe(Frequency.WEEKLY);
    expect(result.current.weekDays).toEqual(["monday", "tuesday", "wednesday"]);
    expect(setDraft).not.toHaveBeenCalled();
  });

  it("does not rewrite an unchanged recurring rule when the setter changes", () => {
    const source = createMockEvent({
      schedule: SCHEDULE,
      recurrence: {
        kind: "series",
        rules: ["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=SU;COUNT=4"],
      },
    });
    const draft = editGridEventDraft(source);
    if (!draft) throw new Error("expected edit draft");

    const recurringDraft = {
      ...draft,
      values: {
        ...draft.values,
        recurrence: {
          kind: "series" as const,
          rules: ["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=SU;COUNT=4"],
        },
      },
    } as GridEventDraft;

    const setDraft = mock();
    const nextSetDraft = mock();

    const { rerender } = renderHook(
      ({ setDraftProp }) =>
        useRecurrence(recurringDraft, { setDraft: setDraftProp }),
      {
        initialProps: { setDraftProp: setDraft },
      },
    );

    expect(setDraft).not.toHaveBeenCalled();

    rerender({ setDraftProp: nextSetDraft });

    expect(nextSetDraft).not.toHaveBeenCalled();
  });

  // Regression: opening a later weekday occurrence of a Google-style series
  // (BYDAY without INTERVAL=1) used to rewrite the rule on mount, flip
  // preserve→series, suppress earlier siblings, and leave only the clicked
  // day + forward previews visible.
  it("does not rewrite a preserve occurrence draft whose series omits INTERVAL=1", () => {
    const { result, rerender, assertUntouched } = mountPreserveOccurrence([
      "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    ]);

    expect(result.current.hasRecurrence).toBe(true);
    expect(result.current.freq).toBe(Frequency.WEEKLY);
    expect(result.current.weekDays).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ]);
    assertUntouched();

    rerender();
    assertUntouched();
  });

  it("does not rewrite when series RRULE params are reordered", () => {
    const { assertUntouched, rerender } = mountPreserveOccurrence([
      "RRULE:INTERVAL=1;FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    ]);

    assertUntouched();
    rerender();
    assertUntouched();
  });

  it("does not rewrite when series BYDAY order differs from the rebuilt rule", () => {
    const { assertUntouched, rerender, result } = mountPreserveOccurrence([
      "RRULE:FREQ=WEEKLY;BYDAY=FR,MO,TU,WE,TH",
    ]);

    expect(result.current.weekDays).toEqual([
      "friday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
    ]);
    assertUntouched();
    rerender();
    assertUntouched();
  });

  it("does not rewrite when series includes a default WKST", () => {
    const { assertUntouched, rerender } = mountPreserveOccurrence([
      "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;WKST=MO",
    ]);

    assertUntouched();
    rerender();
    assertUntouched();
  });

  it("writes a real weekday edit and flips preserve to series", () => {
    const seriesId = EventIdSchema.parse("0123456789abcdefaaaaaaaa");
    const { draft, setDraftCalls, result, rerender } = mountPreserveOccurrence(
      ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
      seriesId,
    );

    expect(setDraftCalls()).toBe(0);
    expect(draft().values.recurrence).toEqual({ kind: "preserve" });
    expect(suppressedSeriesIdForDraft(draft())).toBeNull();

    act(() => {
      result.current.setWeekDays([
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
      ]);
    });
    rerender();

    expect(setDraftCalls()).toBeGreaterThan(0);
    expect(draft().values.recurrence).toMatchObject({ kind: "series" });
    expect(suppressedSeriesIdForDraft(draft())).toBe(seriesId);
  });

  // Regression for React error #185 (max update depth exceeded): a timed
  // UNTIL rule crashed the whole app for any non-UTC user. `options.until`
  // off a parsed CompassEventRRule is in the floating frame used for
  // candidate expansion; seeding editable state with it directly meant the
  // rebuilt rrule floated it a second time, drifting the persisted UNTIL by
  // the timezone offset on every render and never converging. The suite runs
  // under TZ=Etc/UTC (packages/scripts/src/testing/...), which hides the
  // drift, so this mocks dayjs.tz.guess() to reproduce a non-UTC host
  // instead - same pattern as getRecurringDraftPreviews.test.ts.
  describe("on a non-UTC host (America/Denver), with a real setDraft feedback loop", () => {
    const denver = "America/Denver";

    afterEach(() => {
      (
        dayjs.tz.guess as unknown as { mockRestore: () => void }
      ).mockRestore?.();
    });

    it("converges instead of looping when editing a timed UNTIL rule", () => {
      spyOn(dayjs.tz, "guess").mockReturnValue(denver);

      const untilRule = "RRULE:FREQ=WEEKLY;UNTIL=20260810T010000Z;BYDAY=SA";
      const source = createMockEvent({
        schedule: EventScheduleSchema.parse({
          kind: "timed",
          start: "2026-07-12T01:15:00.000Z",
          end: "2026-07-12T01:45:00.000Z",
          timeZone: denver,
        }),
        recurrence: { kind: "series", rules: [untilRule] },
      });
      const editedDraft = editGridEventDraft(source);
      if (!editedDraft) throw new Error("expected edit draft");

      let draft: GridEventDraft = {
        ...editedDraft,
        values: {
          ...editedDraft.values,
          recurrence: { kind: "series" as const, rules: [untilRule] },
        },
      } as GridEventDraft;

      let setDraftCalls = 0;
      const setDraft: Dispatch<SetStateAction<GridEventDraft | null>> = (
        updater,
      ) => {
        setDraftCalls++;
        const next = typeof updater === "function" ? updater(draft) : updater;
        if (next) draft = next;
      };

      const { result, rerender } = renderHook(() =>
        useRecurrence(draft, { setDraft }),
      );

      // A real infinite loop would still be climbing after a handful of
      // renders (React itself aborts at 50 nested updates). A convergent
      // rule stabilizes in one write and stays stable.
      const callCountsAfterEachRender: number[] = [];
      for (let i = 0; i < 6; i++) {
        rerender();
        callCountsAfterEachRender.push(setDraftCalls);
      }

      const last = callCountsAfterEachRender.at(-1)!;
      const secondToLast = callCountsAfterEachRender.at(-2)!;
      expect(last).toBe(secondToLast);
      expect(last).toBeLessThan(3);

      const finalRules = resolveDraftRecurrenceRules(draft);
      expect(finalRules).toHaveLength(1);
      expect(finalRules[0]).toContain("UNTIL=20260810T010000Z");

      // The hook's own returned `until` (what EndsOnDate's DatePicker
      // renders) must be the real instant, not the floating stand-in - a
      // pre-existing display bug in this same path (the "Ends on" date
      // showing a day earlier for non-UTC users) that CompassEventRRule's
      // `until` getter now fixes alongside the loop.
      expect(result.current.until?.toISOString()).toBe(
        "2026-08-10T01:00:00.000Z",
      );
    });
  });
});
