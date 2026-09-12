import { ObjectId } from "mongodb";
import { ZodError } from "zod/v4";
import { Status } from "@core/errors/status.codes";
import {
  AdminPutBookingPageInputSchema,
  BOOKING_MAX_MIN_NOTICE_HOURS,
  DEFAULT_WEEKLY_AVAILABILITY,
} from "@core/types/booking.contracts";
import { type TimeZone } from "@core/types/domain-primitives";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { UserDriver } from "@backend/__tests__/drivers/user.driver";
import { UtilDriver } from "@backend/__tests__/drivers/util.driver";
import { seedGoogleCalendar } from "@backend/__tests__/helpers/event-propagation.test-helpers";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import * as billingGuard from "@backend/billing/billing.guard";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { bookingPageRepository } from "@backend/booking/booking-page.repository";
import { bookingReservationRepository } from "@backend/booking/booking-reservation.repository";
import bookingPageService from "@backend/booking/services/booking-page.service";
import calendarService from "@backend/calendar/services/calendar.service";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import { eventMutationError } from "@backend/event/event.error";
import userService from "@backend/user/services/user.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const calendarId = () => new ObjectId().toString();

const writableCalendar = (id = calendarId()) => ({
  id,
  tenantId: new ObjectId().toString(),
  principalId: new ObjectId().toString(),
  connectionId: new ObjectId().toString(),
  providerCalendarId: "primary",
  displayName: "Work",
  color: "#9fe1e7",
  active: true,
  primary: true,
  accessRole: "owner" as const,
  capabilities: {
    canReadEvents: true,
    canWriteEvents: true,
    canReadBusy: true,
    canInviteAttendees: true,
  },
  createsGoogleMeet: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
});

const healthyConnection = () => ({
  id: new ObjectId().toString(),
  tenantId: new ObjectId().toString(),
  principalId: new ObjectId().toString(),
  provider: "google" as const,
  account: {
    providerAccountId: "112233445566778899000",
    email: "user@gmail.com",
    displayName: "Test User",
  },
  capabilities: ["readEvents", "writeEvents"] as const,
  state: "healthy" as const,
  stateReason: null,
  lastSyncedAt: "2026-07-20T12:00:00.000Z",
  lastHealthyAt: "2026-07-20T12:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
});

const samplePutInput = (overrides: Record<string, unknown> = {}) => {
  const destination = calendarId();
  return AdminPutBookingPageInputSchema.parse({
    enabled: true,
    durationMinutes: 30,
    destinationCalendarId: destination,
    blockingCalendarIds: [destination],
    timeZone: "America/Denver",
    weeklyAvailability: [{ weekday: 1, start: "09:00", end: "17:00" }],
    minNoticeHours: 4,
    maxHorizonDays: 60,
    ...overrides,
  });
};

const createNamedUser = async (name: string) => {
  const created = await userService.createUser(
    UserDriver.generateGoogleUser({ name }),
  );
  return new ObjectId(created.userId);
};

describe("BookingPageService", () => {
  let syncSpies: Array<{ mockRestore: () => void }> = [];

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });
  beforeEach(async () => {
    await cleanupCollections();
    syncSpies.forEach((spy) => spy.mockRestore());
    syncSpies = [];
  });
  afterAll(cleanupTestDb);

  const mockHealthySync = (
    calendars: ReturnType<typeof writableCalendar>[],
    connection: ReturnType<typeof healthyConnection> = healthyConnection(),
  ) => {
    const wired = calendars.map((calendar) => ({
      ...calendar,
      connectionId: connection.id,
    }));
    syncSpies.push(
      spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
        listConnections: mock(() =>
          Promise.resolve({
            ok: true as const,
            value: { connections: [connection] },
          }),
        ),
        listCalendars: mock(() =>
          Promise.resolve({
            ok: true as const,
            value: { calendars: wired },
          }),
        ),
      } as never),
    );
    return { connection, calendars: wired };
  };

  it("returns defaults on GET before any PUT without inserting a row", async () => {
    const { user } = await UtilDriver.setupTestUser();

    const page = await bookingPageService.getAdminPage(user._id);

    expect(page).toEqual(
      expect.objectContaining({
        enabled: false,
        durationMinutes: 30,
        weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
        isConfigured: false,
        suggestedSlug: expect.any(String),
      }),
    );
    expect(await bookingPageRepository.findByUserId(user._id)).toBeNull();
  });

  it("rejects enabling with zero weekly hours and writes no row", async () => {
    const { user } = await UtilDriver.setupTestUser();

    await expect(
      bookingPageService.putAdminPage(
        user._id,
        samplePutInput({ enabled: true, weeklyAvailability: [] }),
      ),
    ).rejects.toMatchObject({ bookingCode: "AVAILABILITY_REQUIRED" });
    expect(await bookingPageRepository.findByUserId(user._id)).toBeNull();
  });

  it("returns suggestedSlug on GET before any PUT", async () => {
    const userId = await createNamedUser("Tyler Dane");

    const page = await bookingPageService.getAdminPage(userId);

    expect(page).toEqual(
      expect.objectContaining({
        isConfigured: false,
        suggestedSlug: "tylerdane",
      }),
    );
  });

  it("returns the host calendar timezone on GET before any PUT, not UTC", async () => {
    const { user } = await UtilDriver.setupTestUser();
    await seedGoogleCalendar(user._id, {
      timeZone: "America/Chicago" as TimeZone,
    });

    const page = await bookingPageService.getAdminPage(user._id);

    expect(page).toEqual(
      expect.objectContaining({
        timeZone: "America/Chicago",
        isConfigured: false,
      }),
    );
    expect(page.timeZone).not.toBe("UTC");
  });

  it("returns a stored UTC timezone unchanged", async () => {
    const userId = await createNamedUser("Utc Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);

    await bookingPageService.putAdminPage(
      userId,
      samplePutInput({ enabled: false, timeZone: "UTC" }),
    );

    const page = await bookingPageService.getAdminPage(userId);

    expect(page).toEqual(
      expect.objectContaining({
        isConfigured: true,
        timeZone: "UTC",
      }),
    );
  });

  it("reports a saved-but-never-enabled page as configured", async () => {
    const userId = await createNamedUser("Draft User");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);

    // Saved while disabled, so no slug is allocated and the response is the
    // bare input shape - indistinguishable from "never saved" without the
    // flag. The stored timezone here is a real choice the client must keep.
    await bookingPageService.putAdminPage(
      userId,
      samplePutInput({ enabled: false }),
    );

    const page = await bookingPageService.getAdminPage(userId);

    expect("bookingUrl" in page).toBe(false);
    expect(page).toEqual(
      expect.objectContaining({
        isConfigured: true,
        timeZone: "America/Denver",
        suggestedSlug: expect.any(String),
      }),
    );
  });

  it("returns suggestedSlug after a disabled PUT", async () => {
    const userId = await createNamedUser("Draft Slug User");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);

    await bookingPageService.putAdminPage(
      userId,
      samplePutInput({ enabled: false }),
    );

    const page = await bookingPageService.getAdminPage(userId);

    expect(page).toEqual(
      expect.objectContaining({
        isConfigured: true,
        suggestedSlug: "draftsluguser",
      }),
    );
  });

  it("persists a requested slug on a disabled page", async () => {
    const userId = await createNamedUser("Disabled Slug Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      enabled: false,
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
      slug: "tyler-dane",
    });

    const saved = await bookingPageService.putAdminPage(userId, input);
    expect(saved).toEqual(
      expect.objectContaining({
        isConfigured: true,
        suggestedSlug: "tyler-dane",
      }),
    );

    const page = await bookingPageService.getAdminPage(userId);
    expect(page).toEqual(
      expect.objectContaining({
        isConfigured: true,
        suggestedSlug: "tyler-dane",
      }),
    );

    const record = await bookingPageRepository.findByUserId(userId);
    expect(record?.bookingSlug).toBe("tyler-dane");
    expect(record).not.toHaveProperty("slug");
  });

  it("renames an enabled page slug", async () => {
    const userId = await createNamedUser("Rename Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });

    const enabled = await bookingPageService.putAdminPage(userId, input);
    expect("slug" in enabled && enabled.slug).toBe("renamehost");

    const renamed = await bookingPageService.putAdminPage(userId, {
      ...input,
      slug: "new-address",
    });
    expect("slug" in renamed && renamed.slug).toBe("new-address");

    const record = await bookingPageRepository.findByUserId(userId);
    expect(record?.bookingSlug).toBe("new-address");
  });

  it("rejects renaming to another host's slug", async () => {
    const firstUserId = await createNamedUser("First Host");
    const secondUserId = await createNamedUser("Second Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });

    const firstPage = await bookingPageService.putAdminPage(firstUserId, input);
    expect("slug" in firstPage && firstPage.slug).toBe("firsthost");

    await expect(
      bookingPageService.putAdminPage(secondUserId, {
        ...samplePutInput({
          enabled: false,
          destinationCalendarId: calendar.id,
          blockingCalendarIds: [calendar.id],
        }),
        slug: "firsthost",
      }),
    ).rejects.toMatchObject({
      bookingCode: "SLUG_TAKEN",
    });

    const secondRecord = await bookingPageRepository.findByUserId(secondUserId);
    expect(secondRecord?.bookingSlug).toBeUndefined();
  });

  it("marks a disabled PUT response as configured too", async () => {
    const userId = await createNamedUser("Disabled Saver");

    // The PUT answer for a page with no slug is the same bare shape as GET's,
    // so it needs the flag as well - the client parses both with one schema.
    const saved = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({ enabled: false }),
    );

    expect("bookingUrl" in saved).toBe(false);
    expect(saved).toEqual(
      expect.objectContaining({
        isConfigured: true,
        suggestedSlug: expect.any(String),
      }),
    );
  });

  it("allocates a slug once and keeps it on later PUTs", async () => {
    const userId = await createNamedUser("Guard User");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });

    const enabled = await bookingPageService.putAdminPage(userId, input);
    expect("slug" in enabled && enabled.slug).toBe("guarduser");
    expect("bookingUrl" in enabled && enabled.bookingUrl).toContain("/meet/");

    const updated = await bookingPageService.putAdminPage(userId, {
      ...input,
      durationMinutes: 45,
    });

    expect("slug" in updated && updated.slug).toBe("guarduser");
    expect("durationMinutes" in updated && updated.durationMinutes).toBe(45);
  });

  it("rejects a PUT with out-of-range notice and does not persist", async () => {
    const userId = await createNamedUser("Bound Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });
    await bookingPageService.putAdminPage(userId, input);

    await expect(
      bookingPageService.putAdminPage(userId, {
        ...input,
        minNoticeHours: BOOKING_MAX_MIN_NOTICE_HOURS + 1,
      }),
    ).rejects.toBeInstanceOf(ZodError);

    const page = await bookingPageService.getAdminPage(userId);
    expect(page).toEqual(
      expect.objectContaining({
        minNoticeHours: 4,
      }),
    );
  });

  it("strips removed host settings keys from PUT input", async () => {
    const userId = await createNamedUser("Legacy Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
      bufferMinutes: 30,
      maxBookingsPerDay: 4,
      welcomeText: "hello",
      guestsCanInviteOthers: true,
    });

    await bookingPageService.putAdminPage(userId, input);
    const page = await bookingPageService.getAdminPage(userId);

    expect(page).not.toHaveProperty("bufferMinutes");
    expect(page).not.toHaveProperty("maxBookingsPerDay");
    expect(page).not.toHaveProperty("welcomeText");
    expect(page).not.toHaveProperty("guestsCanInviteOthers");
  });

  it("suffixes reserved slug collisions", async () => {
    const firstUserId = await createNamedUser("Week");
    const secondUserId = await createNamedUser("Week");

    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });

    const firstPage = await bookingPageService.putAdminPage(firstUserId, input);
    expect("slug" in firstPage && firstPage.slug).toBe("week2");

    const secondPage = await bookingPageService.putAdminPage(
      secondUserId,
      input,
    );
    expect("slug" in secondPage && secondPage.slug).toBe("week3");
  });

  it("rejects enable without a healthy calendar connection", async () => {
    const { user } = await UtilDriver.setupTestUser();
    syncSpies.push(
      spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
        listConnections: mock(() =>
          Promise.resolve({
            ok: true as const,
            value: { connections: [] },
          }),
        ),
        listCalendars: mock(() =>
          Promise.resolve({ ok: true as const, value: { calendars: [] } }),
        ),
      } as never),
    );

    await expect(
      bookingPageService.putAdminPage(user._id, samplePutInput()),
    ).rejects.toMatchObject({
      bookingCode: "CALENDAR_NOT_CONNECTED",
    });
  });

  it("enables with a healthy Microsoft connection and a writable destination", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const connection = {
      ...healthyConnection(),
      provider: "microsoft" as const,
    };
    const calendar = writableCalendar();
    mockHealthySync(
      [calendar],
      connection as unknown as ReturnType<typeof healthyConnection>,
    );
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });

    const saved = await bookingPageService.putAdminPage(user._id, input);

    expect(saved).toEqual(
      expect.objectContaining({
        enabled: true,
        destinationCalendarId: calendar.id,
      }),
    );
  });

  it("rejects enable when billing forbids writes", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    syncSpies.push(
      spyOn(billingGuard, "assertBillingAllowsWrites").mockRejectedValue(
        eventMutationError(
          "BILLING_REQUIRED",
          "A paid subscription is required to make changes",
        ),
      ),
    );

    await expect(
      bookingPageService.putAdminPage(
        user._id,
        samplePutInput({
          destinationCalendarId: calendar.id,
          blockingCalendarIds: [calendar.id],
        }),
      ),
    ).rejects.toMatchObject({ code: "BILLING_REQUIRED" });
  });

  it("rejects enable when destination calendar is not writable", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const readOnly = writableCalendar();
    readOnly.capabilities.canWriteEvents = false;
    mockHealthySync([readOnly]);

    await expect(
      bookingPageService.putAdminPage(
        user._id,
        samplePutInput({
          destinationCalendarId: readOnly.id,
          blockingCalendarIds: [readOnly.id],
        }),
      ),
    ).rejects.toMatchObject({
      bookingCode: "DESTINATION_NOT_WRITABLE",
    });
  });

  it("accepts the Compass-local calendar as a blocking calendar", async () => {
    const userId = await createNamedUser("Local Blocker");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    await calendarService.ensureLocalCalendar(userId);
    const localCalendar = await calendarService.getLocalCalendar(userId);
    if (!localCalendar) {
      throw new Error("expected Compass-local calendar after user create");
    }
    const localId = localCalendar._id.toHexString();

    const saved = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id, localId],
      }),
    );

    expect(saved).toEqual(
      expect.objectContaining({
        blockingCalendarIds: expect.arrayContaining([calendar.id, localId]),
      }),
    );
  });

  it("rejects enable when a blocking calendar is unknown", async () => {
    const userId = await createNamedUser("Bad Blocker");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);

    await expect(
      bookingPageService.putAdminPage(
        userId,
        samplePutInput({
          destinationCalendarId: calendar.id,
          blockingCalendarIds: [calendar.id, new ObjectId().toString()],
        }),
      ),
    ).rejects.toMatchObject({
      bookingCode: "BLOCKING_CALENDAR_INVALID",
    });
  });

  it("rejects enable when timezone is unset", async () => {
    const userId = await createNamedUser("No Zone");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const { timeZone: _unused, ...withoutTimeZone } = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });

    await expect(
      bookingPageService.putAdminPage(userId, withoutTimeZone),
    ).rejects.toMatchObject({
      bookingCode: "TIMEZONE_REQUIRED",
    });
  });

  it("enables when timezone is explicit, including UTC", async () => {
    const userId = await createNamedUser("Explicit Zone");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
      timeZone: "UTC",
    });

    const page = await bookingPageService.putAdminPage(userId, input);

    expect(page).toEqual(
      expect.objectContaining({
        enabled: true,
        timeZone: "UTC",
      }),
    );
  });

  const insertReservation = async (
    pageId: ObjectId,
    overrides: {
      guestName?: string;
      status?: "confirmed" | "cancelled";
      slotStart?: Date;
    } = {},
  ) => {
    const slotStart = overrides.slotStart ?? new Date();
    const record = await bookingReservationRepository.insert({
      _id: new ObjectId(),
      pageId,
      slotStart,
      slotEnd: new Date(slotStart.getTime() + 30 * 60 * 1000),
      guestName: overrides.guestName ?? "Bob",
      guestEmail: "bob@example.com",
      notes: null,
      guestTimeZone: "UTC" as TimeZone,
      status: "confirmed",
      calendarEventId: "evt-1",
      cancelTokenHash: "c".repeat(64),
    });
    if (overrides.status === "cancelled") {
      await bookingReservationRepository.markCancelled(record._id);
    }
    return record;
  };

  it("claims confirmed bookings created after hostNoticedAt and stamps", async () => {
    const userId = await createNamedUser("Claim Host");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    expect("id" in page).toBe(true);
    const pageId = new ObjectId("id" in page ? page.id : "");

    await insertReservation(pageId, {
      guestName: "Ada",
      slotStart: new Date("2026-09-24T16:00:00.000Z"),
    });
    await insertReservation(pageId, {
      guestName: "Bob",
      slotStart: new Date("2026-09-24T17:00:00.000Z"),
    });

    const first = await bookingPageService.claimNewMeetings(userId);
    expect(first.reservations.map((row) => row.guestName)).toEqual([
      "Ada",
      "Bob",
    ]);
    const stamped = await bookingPageRepository.findByUserId(userId);
    expect(stamped?.hostNoticedAt).toBeInstanceOf(Date);

    const second = await bookingPageService.claimNewMeetings(userId);
    expect(second.reservations).toEqual([]);
  });

  it("returns none for a disabled page and does not stamp", async () => {
    const userId = await createNamedUser("Off Claim");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const page = await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        enabled: false,
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    const stored = await bookingPageRepository.findByUserId(userId);
    expect(stored).not.toBeNull();
    await insertReservation(stored!._id);

    const claimed = await bookingPageService.claimNewMeetings(userId);
    expect(claimed.reservations).toEqual([]);
    const after = await bookingPageRepository.findByUserId(userId);
    expect(after?.hostNoticedAt).toBeUndefined();
    expect("bookingUrl" in page).toBe(false);
  });

  it("returns none when the host has no page", async () => {
    const userId = await createNamedUser("No Page Claim");
    const claimed = await bookingPageService.claimNewMeetings(userId);
    expect(claimed.reservations).toEqual([]);
  });

  it("never returns a cancelled reservation", async () => {
    const userId = await createNamedUser("Cancel Claim");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        destinationCalendarId: calendar.id,
        blockingCalendarIds: [calendar.id],
      }),
    );
    const stored = await bookingPageRepository.findByUserId(userId);
    expect(stored).not.toBeNull();
    await insertReservation(stored!._id, {
      guestName: "Cancelled",
      status: "cancelled",
      slotStart: new Date("2026-09-24T16:00:00.000Z"),
    });
    await insertReservation(stored!._id, {
      guestName: "Live",
      slotStart: new Date("2026-09-24T17:00:00.000Z"),
    });

    const claimed = await bookingPageService.claimNewMeetings(userId);
    expect(claimed.reservations.map((row) => row.guestName)).toEqual(["Live"]);
  });

  it("keeps hostNoticedAt across a settings save", async () => {
    const userId = await createNamedUser("Stamp Survive");
    const calendar = writableCalendar();
    mockHealthySync([calendar]);
    const input = samplePutInput({
      destinationCalendarId: calendar.id,
      blockingCalendarIds: [calendar.id],
    });
    await bookingPageService.putAdminPage(userId, input);
    await bookingPageService.claimNewMeetings(userId);
    const stamped = await bookingPageRepository.findByUserId(userId);
    expect(stamped?.hostNoticedAt).toBeInstanceOf(Date);

    await bookingPageService.putAdminPage(userId, {
      ...input,
      durationMinutes: 45,
    });
    const after = await bookingPageRepository.findByUserId(userId);
    expect(after?.hostNoticedAt?.getTime()).toBe(
      stamped?.hostNoticedAt?.getTime(),
    );
  });

  it("adds a calendar discovered after the booking page exists", async () => {
    const userId = await createNamedUser("Late Discovery");
    const google = writableCalendar();
    mockHealthySync([google]);
    await bookingPageService.putAdminPage(
      userId,
      samplePutInput({
        enabled: false,
        destinationCalendarId: google.id,
        blockingCalendarIds: [google.id],
      }),
    );

    const microsoft = writableCalendar();
    mockHealthySync([google, microsoft]);
    const page = await bookingPageService.getAdminPage(userId);

    expect(page.blockingCalendarIds).toEqual(
      expect.arrayContaining([google.id, microsoft.id]),
    );
  });

  it("does not re-add a calendar the host removed from blockers", async () => {
    const userId = await createNamedUser("Blocker Opt Out");
    const google = writableCalendar();
    const microsoft = writableCalendar();
    mockHealthySync([google, microsoft]);
    const base = samplePutInput({
      enabled: false,
      destinationCalendarId: google.id,
      blockingCalendarIds: [google.id, microsoft.id],
    });
    await bookingPageService.putAdminPage(userId, base);
    await bookingPageService.putAdminPage(userId, {
      ...base,
      blockingCalendarIds: [google.id],
    });

    mockHealthySync([google, microsoft]);
    const page = await bookingPageService.getAdminPage(userId);

    expect(page.blockingCalendarIds).toEqual(
      expect.arrayContaining([google.id]),
    );
    expect(page.blockingCalendarIds).not.toContain(microsoft.id);
  });
});

describe("BookingController", () => {
  const baseDriver = new BaseDriver();

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
    await baseDriver.listen();
  });
  beforeEach(cleanupCollections);
  afterAll(async () => {
    await baseDriver.teardown();
    await cleanupTestDb();
  });

  it("GET /api/booking/page returns defaults without a session row", async () => {
    const { user } = await UtilDriver.setupTestUser();

    const response = await baseDriver
      .getServer()
      .get("/api/booking/page")
      .set(
        "Cookie",
        `session=${JSON.stringify({ userId: user._id.toString() })}`,
      )
      .expect(Status.OK);

    expect(response.body).toEqual(
      expect.objectContaining({ enabled: false, durationMinutes: 30 }),
    );
  });

  it("POST /api/booking/page/new-meetings/claim requires a session", async () => {
    const response = await baseDriver
      .getServer()
      .post("/api/booking/page/new-meetings/claim");
    expect(response.status).toBe(Status.UNAUTHORIZED);
  });
});
