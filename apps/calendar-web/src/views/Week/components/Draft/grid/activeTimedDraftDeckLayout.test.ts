import { Origin } from "@core/constants/core.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import { getActiveTimedDraftDeckLayout } from "./activeTimedDraftDeckLayout";
import { describe, expect, it } from "bun:test";

const createTimedEvent = (overrides: Partial<GridEvent> = {}): GridEvent => ({
  description: "",
  endDate: "2026-05-26T10:00:00.000Z",
  isAllDay: false,
  origin: Origin.COMPASS,
  position: gridEventDefaultPosition,
  startDate: "2026-05-26T09:00:00.000Z",
  title: "Planning",
  user: "user-1",
  ...overrides,
});

describe("getActiveTimedDraftDeckLayout", () => {
  it("finds the saved draft event's stacked layout from real overlapping events", () => {
    const draft = createTimedEvent({
      _id: "draft",
      endDate: "2026-05-26T10:15:00.000Z",
      startDate: "2026-05-26T09:15:00.000Z",
    });
    const events = [
      createTimedEvent({
        _id: "other-day",
        endDate: "2026-05-27T10:00:00.000Z",
        startDate: "2026-05-27T09:00:00.000Z",
      }),
      createTimedEvent({
        _id: "draft",
      }),
      createTimedEvent({
        _id: "overlap",
        endDate: "2026-05-26T10:30:00.000Z",
        startDate: "2026-05-26T09:30:00.000Z",
      }),
    ];

    expect(getActiveTimedDraftDeckLayout(draft, events)).toEqual({
      groupSize: 2,
      order: 0,
    });
  });

  it("does not create a deck layout for new drafts", () => {
    const draft = createTimedEvent({ _id: "draft" });
    const events = [
      createTimedEvent({
        _id: "overlap",
        endDate: "2026-05-26T10:30:00.000Z",
        startDate: "2026-05-26T09:30:00.000Z",
      }),
    ];

    expect(getActiveTimedDraftDeckLayout(draft, events)).toBeNull();
  });

  it("lays out a saved all-day event converted to timed", () => {
    const draft = createTimedEvent({
      _id: "draft",
      endDate: "2026-05-26T10:15:00.000Z",
      startDate: "2026-05-26T09:15:00.000Z",
    });
    const events = [
      createTimedEvent({ _id: "draft", isAllDay: true }),
      createTimedEvent({
        _id: "overlap",
        endDate: "2026-05-26T10:30:00.000Z",
        startDate: "2026-05-26T09:30:00.000Z",
      }),
    ];

    expect(getActiveTimedDraftDeckLayout(draft, events)).toEqual({
      groupSize: 2,
      order: 0,
    });
  });

  it("ignores all-day drafts", () => {
    const draft = createTimedEvent({
      _id: "draft",
      isAllDay: true,
    });

    expect(getActiveTimedDraftDeckLayout(draft, [draft])).toBeNull();
  });
});
