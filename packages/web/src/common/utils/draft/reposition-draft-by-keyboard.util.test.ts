import { act } from "react";
import dayjs from "@core/util/date/dayjs";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  resetEffectiveTimeZoneStoreForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { calendarDateInEffectiveTimeZone } from "@web/timezone/in-time-zone";
import { repositionDraftByKeyboard } from "./reposition-draft-by-keyboard.util";
import { afterEach, describe, expect, it } from "bun:test";

describe("repositionDraftByKeyboard", () => {
  afterEach(() => {
    act(() => {
      resetEffectiveTimeZoneStoreForTests();
    });
  });

  it("moves a createShortcut timed draft by 15 minutes with ArrowDown", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );

    const next = repositionDraftByKeyboard({
      activity: "createShortcut",
      draft,
      key: "ArrowDown",
    });

    expect(dayjs(next?.values.schedule.start).format()).toBe(
      dayjs("2026-05-20T09:15:00.000").format(),
    );
  });

  it("returns null when the next start is outside the allowed range", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );

    const next = repositionDraftByKeyboard({
      activity: "createShortcut",
      draft,
      key: "ArrowRight",
      isStartAllowed: () => false,
    });

    expect(next).toBeNull();
  });

  it("returns null for activities that are not keyboard-repositionable", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );

    expect(
      repositionDraftByKeyboard({
        activity: "eventRightClick",
        draft,
        key: "ArrowDown",
      }),
    ).toBeNull();
  });

  it("moves a keyboardPlace timed draft by 15 minutes with ArrowDown", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );

    const next = repositionDraftByKeyboard({
      activity: "keyboardPlace",
      draft,
      key: "ArrowDown",
    });

    expect(dayjs(next?.values.schedule.start).format()).toBe(
      dayjs("2026-05-20T09:15:00.000").format(),
    );
  });

  it("moves a keyboardPlace timed draft by 60 minutes with a coarse ArrowDown", () => {
    const draft = createGridEventDraft(
      timedGridSchedule(
        new Date("2026-05-20T09:00:00.000"),
        new Date("2026-05-20T10:00:00.000"),
      ),
    );

    const next = repositionDraftByKeyboard({
      activity: "keyboardPlace",
      draft,
      key: "ArrowDown",
      step: "coarse",
    });

    expect(dayjs(next?.values.schedule.start).format()).toBe(
      dayjs("2026-05-20T10:00:00.000").format(),
    );
  });

  it("moves a timed draft that is same-day in the pin but crosses the browser midnight", () => {
    act(() => {
      setPinnedTimeZone("America/Chicago");
    });

    const draft = createGridEventDraft(
      timedGridSchedule(
        calendarDateInEffectiveTimeZone("2026-05-20").add(18, "hour").toDate(),
        calendarDateInEffectiveTimeZone("2026-05-20").add(20, "hour").toDate(),
      ),
    );

    const next = repositionDraftByKeyboard({
      activity: "createShortcut",
      draft,
      key: "ArrowDown",
    });

    expect(next).not.toBeNull();
    expect(
      calendarDateInEffectiveTimeZone("2026-05-20")
        .add(18, "hour")
        .add(15, "minute")
        .isSame(next?.values.schedule.start),
    ).toBe(true);
  });
});
