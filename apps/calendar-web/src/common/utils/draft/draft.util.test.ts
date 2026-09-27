import { CalendarIdSchema } from "@core/types/domain-primitives";
import dayjs from "@core/util/date/dayjs";
import {
  ID_GRID_EVENTS_ALLDAY,
  ID_GRID_EVENTS_TIMED,
} from "@web/common/constants/web.constants";
import { Categories_Event } from "@web/common/types/web.event.types";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { createGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { assembleDefaultEvent } from "../event/event.util";
import {
  createAlldayDraft,
  createTimedDraft,
  getDraftContainer,
} from "./draft.util";
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

const expectSameTime = (actual: Date | undefined, expected: string) => {
  expect(dayjs(actual).isSame(dayjs(expected))).toBe(true);
};

describe("assembleDefaultEvent", () => {
  it("uses a provided end date for all-day drafts", async () => {
    const event = await assembleDefaultEvent(
      Categories_Event.ALLDAY,
      "2024-01-01",
      "2024-01-02",
    );

    expect(event).toHaveProperty("startDate", "2024-01-01");
    expect(event).toHaveProperty("endDate", "2024-01-02");
  });
});

describe("shortcut draft creation", () => {
  afterEach(() => {
    draftActions.discard();
  });

  it("creates a one-day all-day draft on the given day", async () => {
    setSystemTime(new Date("2026-05-20T10:07:00.000Z"));

    await createAlldayDraft(
      dayjs("2026-05-20T15:00:00.000Z"),
      "createShortcut",
    );

    const { gridDraft, status } = useDraftStore.getState();

    expect(status?.eventType).toBe(Categories_Event.ALLDAY);
    expectSameTime(
      gridDraft?.values.schedule.start,
      "2026-05-20T00:00:00.000Z",
    );
    expectSameTime(gridDraft?.values.schedule.end, "2026-05-21T00:00:00.000Z");
    expect(gridDraft?.kind).toBe("create");
    if (gridDraft?.kind === "create") {
      expect(gridDraft.clientId).toBeDefined();
    }
  });

  it("creates timed drafts at the current hour on the given day", async () => {
    setSystemTime(new Date("2026-05-20T10:07:00.000Z"));

    await createTimedDraft(dayjs("2026-06-01T00:00:00.000Z"), "createShortcut");

    const { gridDraft, status } = useDraftStore.getState();

    expect(status?.eventType).toBe(Categories_Event.TIMED);
    expectSameTime(
      gridDraft?.values.schedule.start,
      "2026-06-01T10:15:00.000Z",
    );
    expectSameTime(gridDraft?.values.schedule.end, "2026-06-01T11:15:00.000Z");
  });

  it("clamps a near-midnight timed draft to end at midnight instead of spanning days", async () => {
    // 23:22 -> start rounds to 23:30; a full hour would cross midnight and
    // send the draft to the all-day row (multi-day timed display).
    setSystemTime(new Date("2026-05-20T23:22:00.000Z"));

    await createTimedDraft(dayjs("2026-05-20T00:00:00.000Z"), "createShortcut");

    const { gridDraft, status } = useDraftStore.getState();

    expect(status?.eventType).toBe(Categories_Event.TIMED);
    expectSameTime(
      gridDraft?.values.schedule.start,
      "2026-05-20T23:30:00.000Z",
    );
    expectSameTime(gridDraft?.values.schedule.end, "2026-05-21T00:00:00.000Z");
  });

  it("keeps a late-evening timed draft on the selected day when minutes round past the hour", async () => {
    // 23:50 -> roundToNext(50, 15) is 60, and minute(60) at 23:00 is the next
    // day. The selected column must still own the draft.
    setSystemTime(new Date("2026-05-20T23:50:00.000Z"));

    await createTimedDraft(dayjs("2026-06-01T00:00:00.000Z"), "createShortcut");

    const { gridDraft, status } = useDraftStore.getState();

    expect(status?.eventType).toBe(Categories_Event.TIMED);
    expectSameTime(
      gridDraft?.values.schedule.start,
      "2026-06-01T23:45:00.000Z",
    );
    expectSameTime(gridDraft?.values.schedule.end, "2026-06-02T00:00:00.000Z");
  });

  it("stores a provided calendarId on timed shortcut drafts", async () => {
    setSystemTime(new Date("2026-05-20T10:07:00.000Z"));
    const calendarId = CalendarIdSchema.parse(createObjectIdString());

    await createTimedDraft(
      dayjs("2026-05-20T00:00:00.000Z"),
      "createShortcut",
      calendarId,
    );

    expect(useDraftStore.getState().gridDraft?.values.calendarId).toBe(
      calendarId,
    );
  });

  it("creates a keyboardPlace timed draft with the form closed", async () => {
    setSystemTime(new Date("2026-05-20T10:07:00.000Z"));

    await createTimedDraft(dayjs("2026-05-20T00:00:00.000Z"), "keyboardPlace");

    const { gridDraft, status } = useDraftStore.getState();

    expect(status?.activity).toBe("keyboardPlace");
    expect(status?.isFormOpen).toBe(false);
    expect(status?.eventType).toBe(Categories_Event.TIMED);
    expectSameTime(
      gridDraft?.values.schedule.start,
      "2026-05-20T10:15:00.000Z",
    );
    expectSameTime(gridDraft?.values.schedule.end, "2026-05-20T11:15:00.000Z");
  });

  it("stores a provided calendarId on all-day shortcut drafts", async () => {
    setSystemTime(new Date("2026-05-20T10:07:00.000Z"));
    const calendarId = CalendarIdSchema.parse(createObjectIdString());

    await createAlldayDraft(
      dayjs("2026-05-18T00:00:00.000Z"),
      "createShortcut",
      calendarId,
    );

    expect(useDraftStore.getState().gridDraft?.values.calendarId).toBe(
      calendarId,
    );
  });
});

describe("getDraftContainer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("uses the draft's live schedule instead of its original event category", () => {
    const timedContainer = document.createElement("div");
    timedContainer.id = ID_GRID_EVENTS_TIMED;
    const allDayContainer = document.createElement("div");
    allDayContainer.id = ID_GRID_EVENTS_ALLDAY;
    document.body.append(timedContainer, allDayContainer);

    const draft = createGridEventDraft({
      kind: "allDay",
      start: new Date("2026-05-20T00:00:00.000Z"),
      end: new Date("2026-05-21T00:00:00.000Z"),
    });

    expect(getDraftContainer(draft)).toBe(allDayContainer);
  });
});

afterAll(() => {
  setSystemTime();
});
