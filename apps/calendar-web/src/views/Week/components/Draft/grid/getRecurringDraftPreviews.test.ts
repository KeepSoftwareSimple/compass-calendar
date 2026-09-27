import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import { getRecurringDraftPreviews } from "./getRecurringDraftPreviews";
import { afterEach, describe, expect, spyOn, test } from "bun:test";

const startOfView = dayjs("2026-07-05T00:00:00.000Z"); // Sun
const endOfView = dayjs("2026-07-11T23:59:59.999Z"); // Sat

const timedDraft = (overrides: Partial<GridEvent> = {}): GridEvent =>
  ({
    isAllDay: false,
    // Wednesday 10:00–11:00
    startDate: "2026-07-08T10:00:00.000Z",
    endDate: "2026-07-08T11:00:00.000Z",
    title: "Standup",
    ...overrides,
  }) as GridEvent;

const dayKey = (date?: string) => dayjs(date).format(YEAR_MONTH_DAY_FORMAT);

describe("getRecurringDraftPreviews", () => {
  test("returns [] for a non-recurring draft", () => {
    expect(
      getRecurringDraftPreviews(timedDraft(), startOfView, endOfView),
    ).toEqual([]);
  });

  test("returns [] for a null draft", () => {
    expect(getRecurringDraftPreviews(null, startOfView, endOfView)).toEqual([]);
  });

  test("returns [] for an all-day recurring draft", () => {
    const draft = timedDraft({
      isAllDay: true,
      recurrence: { rule: ["RRULE:FREQ=DAILY"] },
    });

    expect(getRecurringDraftPreviews(draft, startOfView, endOfView)).toEqual(
      [],
    );
  });

  test("expands a daily draft to the remaining days of the view, excluding its own day", () => {
    const draft = timedDraft({ recurrence: { rule: ["RRULE:FREQ=DAILY"] } });

    const previews = getRecurringDraftPreviews(draft, startOfView, endOfView);

    // Wed is the interactive draft; Thu/Fri/Sat are previews (Sun next week is
    // past the view).
    const previewDays = previews.map((p) => dayKey(p.startDate));
    expect(previewDays).toEqual(["2026-07-09", "2026-07-10", "2026-07-11"]);
    // None coincide with the draft's own day.
    expect(previewDays).not.toContain(dayKey(draft.startDate));
  });

  test("keeps the draft's time-of-day and duration on each occurrence", () => {
    const draft = timedDraft({ recurrence: { rule: ["RRULE:FREQ=DAILY"] } });

    const previews = getRecurringDraftPreviews(draft, startOfView, endOfView);

    for (const preview of previews) {
      const durationMs = dayjs(preview.endDate).diff(preview.startDate);
      expect(durationMs).toBe(60 * 60 * 1000); // 1 hour, same as the draft
    }
  });

  test("previews carry no id so they stay inert", () => {
    const draft = timedDraft({
      _id: "draft-1",
      recurrence: { rule: ["RRULE:FREQ=DAILY"] },
    });

    const previews = getRecurringDraftPreviews(draft, startOfView, endOfView);

    expect(previews.length).toBeGreaterThan(0);
    expect(previews.every((p) => p._id === undefined)).toBe(true);
  });

  test("expands a weekly draft to only its matching weekday in view", () => {
    const draft = timedDraft({ recurrence: { rule: ["RRULE:FREQ=WEEKLY"] } });

    // The next weekly occurrence (2026-07-15) is outside this view, so there
    // are no other-day previews within the visible week.
    expect(getRecurringDraftPreviews(draft, startOfView, endOfView)).toEqual(
      [],
    );
  });

  // The suite runs under TZ=Etc/UTC, so the host's timezone and dayjs.tz.guess()
  // (which the underlying CompassEventRRule reads when no tzid is supplied)
  // coincide - the exact condition that hid this bug in production for any
  // non-UTC user. Mocking guess() reproduces a non-UTC host without touching
  // process.env.TZ.
  describe("on a non-UTC host (America/Denver)", () => {
    const denver = "America/Denver";

    afterEach(() => {
      (
        dayjs.tz.guess as unknown as { mockRestore: () => void }
      ).mockRestore?.();
    });

    test("adding a weekday renders the preview on that weekday, not shifted a day earlier", () => {
      spyOn(dayjs.tz, "guess").mockReturnValue(denver);

      // Thursday 7pm Denver (MDT); checking "Saturday" in the form should
      // preview Saturday 7pm, not Friday (the reported bug).
      const draft = timedDraft({
        startDate: "2026-07-23T19:00:00-06:00",
        endDate: "2026-07-23T20:00:00-06:00",
        recurrence: { rule: ["RRULE:FREQ=WEEKLY;BYDAY=TH,SA"] },
      });
      const start = dayjs.tz("2026-07-19 00:00", denver);
      const end = dayjs.tz("2026-07-25 23:59:59", denver);

      const previews = getRecurringDraftPreviews(draft, start, end);
      const labeled = previews.map((p) =>
        dayjs(p.startDate).tz(denver).format("dddd HH:mm"),
      );

      expect(labeled).toEqual(["Saturday 19:00"]);
      expect(
        dayjs(previews[0]!.startDate).isSame(
          dayjs.tz("2026-07-25 19:00", denver),
        ),
      ).toBe(true);
    });
  });
});
