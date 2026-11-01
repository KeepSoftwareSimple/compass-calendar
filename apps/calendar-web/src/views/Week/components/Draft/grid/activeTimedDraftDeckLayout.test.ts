import { Origin } from "@core/constants/core.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import { gridEventsFromProdOverlapExport } from "@web/grid/layout/prod-overlap-export.fixture";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setCalendarTimeZoneHint,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { getActiveTimedDraftDeckLayout } from "./activeTimedDraftDeckLayout";
import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("getActiveTimedDraftDeckLayout", () => {
  it("decks Tyler prod Monthly Ritual against its duplicate when the form is open", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint("America/Denver");
    setPinnedTimeZone("America/Denver");

    const path = join(
      import.meta.dir,
      "../../../../../grid/layout/fixtures/tyler-prod-overlap-2026-10-31.json",
    );
    const payload = JSON.parse(readFileSync(path, "utf8")) as {
      instances: Parameters<typeof gridEventsFromProdOverlapExport>[0];
    };
    const events = gridEventsFromProdOverlapExport(payload.instances);
    const ritual = events.find(
      (event) => event._id === "6a8313927f0219811f36f89a",
    );
    expect(ritual).toBeDefined();

    expect(getActiveTimedDraftDeckLayout(ritual!, events)).toEqual({
      groupSize: 2,
      left: 0.5,
      width: 0.5,
      zIndex: 2,
    });
  });

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
      left: 0,
      width: 0.5,
      zIndex: 1,
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
      left: 0,
      width: 0.5,
      zIndex: 1,
    });
  });

  it("returns to solo width once its overlap partner is deleted", () => {
    const draft = createTimedEvent({ _id: "draft" });
    const overlap = createTimedEvent({
      _id: "overlap",
      endDate: "2026-05-26T10:30:00.000Z",
      startDate: "2026-05-26T09:30:00.000Z",
    });

    expect(getActiveTimedDraftDeckLayout(draft, [draft, overlap])).toEqual({
      groupSize: 2,
      left: 0,
      width: 1,
      zIndex: 1,
    });
    expect(getActiveTimedDraftDeckLayout(draft, [draft])).toBeNull();
  });

  it("ignores hidden overlap partners like the grid does", () => {
    const draft = createTimedEvent({ _id: "draft" });
    const events = [
      draft,
      createTimedEvent({
        _id: "hidden",
        endDate: "2026-05-26T10:30:00.000Z",
        startDate: "2026-05-26T09:30:00.000Z",
      }),
    ];

    expect(
      getActiveTimedDraftDeckLayout(draft, events, new Set(["hidden"])),
    ).toBeNull();
  });

  it("keeps a hidden draft decked against its visible partners", () => {
    const draft = createTimedEvent({ _id: "draft" });
    const events = [
      draft,
      createTimedEvent({
        _id: "overlap",
        endDate: "2026-05-26T10:30:00.000Z",
        startDate: "2026-05-26T09:30:00.000Z",
      }),
    ];

    expect(
      getActiveTimedDraftDeckLayout(draft, events, new Set(["draft"])),
    ).toEqual({ groupSize: 2, left: 0, width: 1, zIndex: 1 });
  });

  it("ignores all-day drafts", () => {
    const draft = createTimedEvent({
      _id: "draft",
      isAllDay: true,
    });

    expect(getActiveTimedDraftDeckLayout(draft, [draft])).toBeNull();
  });
});
