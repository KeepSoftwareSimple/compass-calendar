import { getCalendarCapabilities } from "@core/types/calendar.contracts";
import { createMockLocalEventRecord } from "@web/__tests__/utils/factories/event.factory";
import { createSyncLocalEventsToCloud } from "./local-event-sync.util";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const ensureOfflineDataStoreReady = mock();
const getAllEvents = mock();
const clearAllEvents = mock();
const deleteEvent = mock();
const createEvent = mock();
const listCalendars = mock();

const syncLocalEventsToCloud = createSyncLocalEventsToCloud({
  createEvent,
  listCalendars,
  ensureOfflineDataStoreReady,
  getOfflineDataStore: () => ({
    clearAllEvents,
    deleteEvent,
    getAllEvents,
  }),
});

const SERVER_LOCAL_CALENDAR_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const GOOGLE_PRIMARY_CALENDAR_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

const localCalendar = {
  id: SERVER_LOCAL_CALENDAR_ID,
  name: "Local",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#ffffff",
  provider: "local",
  access: "owner",
  capabilities: {
    ...getCalendarCapabilities("owner"),
    canManage: false,
    canWatchEvents: false,
    canInviteAttendees: false,
  },
  isPrimary: true,
  isVisible: true,
  isActive: true,
} as const;

const googlePrimaryCalendar = {
  ...localCalendar,
  id: GOOGLE_PRIMARY_CALENDAR_ID,
  name: "person@example.com",
  provider: "google",
  accountEmail: "person@example.com",
} as const;

describe("syncLocalEventsToCloud", () => {
  beforeEach(() => {
    ensureOfflineDataStoreReady.mockClear();
    getAllEvents.mockClear();
    clearAllEvents.mockClear();
    deleteEvent.mockClear();
    createEvent.mockClear();
    listCalendars.mockClear();
    listCalendars.mockResolvedValue([localCalendar]);
  });

  it("syncs user-created events and skips demo events, mapping onto the server local calendar", async () => {
    const userRecord = createMockLocalEventRecord({}, false);
    const demoRecord = createMockLocalEventRecord({}, true);
    getAllEvents.mockResolvedValue([userRecord, demoRecord]);

    await expect(syncLocalEventsToCloud()).resolves.toBe(1);

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: userRecord.event.id,
        calendarId: SERVER_LOCAL_CALENDAR_ID,
      }),
    );
    expect(deleteEvent).toHaveBeenCalledWith(userRecord.id);
    expect(clearAllEvents).toHaveBeenCalledTimes(1);
  });

  it("maps onto the connected Google calendar instead of the local one, when one exists", async () => {
    listCalendars.mockResolvedValue([localCalendar, googlePrimaryCalendar]);
    const userRecord = createMockLocalEventRecord({}, false);
    getAllEvents.mockResolvedValue([userRecord]);

    await expect(syncLocalEventsToCloud()).resolves.toBe(1);

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: GOOGLE_PRIMARY_CALENDAR_ID,
      }),
    );
  });

  it("defaults location to an empty string for a record that predates the field", async () => {
    // createMockLocalEventRecord's default content has no `location` key at
    // all (matching a real pre-existing local record) - CreateEventInput
    // requires a definite string, and the backend's strict schema rejects a
    // POST body missing it outright.
    const record = createMockLocalEventRecord({}, false);
    getAllEvents.mockResolvedValue([record]);

    await syncLocalEventsToCloud();

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ location: "" }),
      }),
    );
  });

  it("clears local demo events without sending them to the backend", async () => {
    getAllEvents.mockResolvedValue([createMockLocalEventRecord({}, true)]);

    await expect(syncLocalEventsToCloud()).resolves.toBe(0);

    expect(createEvent).not.toHaveBeenCalled();
    expect(deleteEvent).not.toHaveBeenCalled();
    expect(listCalendars).not.toHaveBeenCalled();
    expect(clearAllEvents).toHaveBeenCalledTimes(1);
  });

  it("returns 0 and skips network calls entirely when storage is empty", async () => {
    getAllEvents.mockResolvedValue([]);

    await expect(syncLocalEventsToCloud()).resolves.toBe(0);

    expect(createEvent).not.toHaveBeenCalled();
    expect(deleteEvent).not.toHaveBeenCalled();
    expect(clearAllEvents).not.toHaveBeenCalled();
  });

  it("keeps records on-device when the server has no local calendar yet, rather than posting a sentinel id", async () => {
    // No local calendar in the list (e.g. it hasn't been provisioned yet).
    listCalendars.mockResolvedValue([]);
    getAllEvents.mockResolvedValue([createMockLocalEventRecord({}, false)]);

    await expect(syncLocalEventsToCloud()).resolves.toBe(0);

    // Never POST against a calendar the backend can't resolve (would 404), and
    // never clear the store - the records stay put for a later sync.
    expect(createEvent).not.toHaveBeenCalled();
    expect(deleteEvent).not.toHaveBeenCalled();
    expect(clearAllEvents).not.toHaveBeenCalled();
  });

  it("carries locally-excluded occurrences forward as EXDATE lines so they don't resurrect", async () => {
    const record = {
      ...createMockLocalEventRecord(
        {
          recurrence: {
            kind: "series",
            rules: ["RRULE:FREQ=DAILY;COUNT=5"] as never,
          },
        },
        false,
      ),
      exdates: ["2026-05-06T09:00:00-06:00"],
    };
    getAllEvents.mockResolvedValue([record]);

    await syncLocalEventsToCloud();

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: {
          kind: "series",
          rules: ["RRULE:FREQ=DAILY;COUNT=5", "EXDATE:20260506T150000Z"],
        },
      }),
    );
  });

  it("deletes each promoted event so a mid-batch failure can resume the rest", async () => {
    const first = createMockLocalEventRecord({}, false);
    const second = createMockLocalEventRecord({}, false);
    getAllEvents.mockResolvedValue([first, second]);
    createEvent
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("network down"));

    await expect(syncLocalEventsToCloud()).rejects.toThrow("network down");

    expect(createEvent).toHaveBeenCalledTimes(2);
    expect(deleteEvent).toHaveBeenCalledTimes(1);
    expect(deleteEvent).toHaveBeenCalledWith(first.id);
    expect(clearAllEvents).not.toHaveBeenCalled();
  });
});
