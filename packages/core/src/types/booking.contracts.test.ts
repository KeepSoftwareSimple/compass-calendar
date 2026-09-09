import { faker } from "@faker-js/faker";
import {
  AdminGetBookingPageResponseSchema,
  AdminGetBookingPageSetupResponseSchema,
  AdminPutBookingPageInputSchema,
  allocateBookingSlug,
  BOOKING_MAX_HORIZON_DAYS,
  BOOKING_MAX_MIN_NOTICE_HOURS,
  BOOKING_PLACEHOLDER_CALENDAR_ID,
  BookingNewMeetingsClaimResponseSchema,
  BookingPageSchema,
  BookingPageStatusResponseSchema,
  BookingReservationSlotsQuerySchema,
  BookingSlugSchema,
  buildDefaultAdminPutInput,
  CancelBookingReservationInputSchema,
  CreateBookingReservationInputSchema,
  CreateBookingReservationResponseSchema,
  DEFAULT_WEEKLY_AVAILABILITY,
  isGuestEmail,
  PatchBookingReservationInputSchema,
  PublicBookingPageSchema,
  PublicGetBookingPageResponseSchema,
  PublicGetBookingReservationResponseSchema,
  pickAdminPutBookingPageInput,
  RescheduleBookingReservationInputSchema,
  RescheduleBookingReservationResponseSchema,
  toPublicBookingPage,
  WeeklyAvailabilityIntervalSchema,
} from "@core/types/booking.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { describe, expect, it } from "bun:test";

const calendarId = () => faker.database.mongodbObjectId();
const objectId = () => faker.database.mongodbObjectId();
const dateTime = () => "2026-08-30T12:00:00.000Z";

const fullAdminPage = () => ({
  id: objectId(),
  slug: "tylerdane",
  hostUserId: objectId(),
  enabled: true,
  durationMinutes: 30 as const,
  destinationCalendarId: calendarId(),
  blockingCalendarIds: [calendarId()],
  timeZone: "America/Denver",
  weeklyAvailability: [
    { weekday: 1 as const, start: "09:00", end: "17:00" },
    { weekday: 3 as const, start: "10:00", end: "12:00" },
  ],
  minNoticeHours: 4,
  maxHorizonDays: 60,
  createdAt: dateTime(),
  updatedAt: dateTime(),
});

describe("BookingSlugSchema", () => {
  it("accepts a valid slug", () => {
    expect(BookingSlugSchema.safeParse("tylerdane").success).toBe(true);
  });

  it("accepts interior hyphens", () => {
    expect(BookingSlugSchema.safeParse("tyler-dane").success).toBe(true);
  });

  it("rejects a leading hyphen", () => {
    expect(BookingSlugSchema.safeParse("-tyler").success).toBe(false);
  });

  it("rejects a trailing hyphen", () => {
    expect(BookingSlugSchema.safeParse("tyler-").success).toBe(false);
  });

  it("rejects consecutive hyphens", () => {
    expect(BookingSlugSchema.safeParse("ty--ler").success).toBe(false);
  });

  it("rejects slugs shorter than 3 characters", () => {
    expect(BookingSlugSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects slugs longer than 32 characters", () => {
    expect(BookingSlugSchema.safeParse("a".repeat(33)).success).toBe(false);
  });

  it("rejects an empty slug", () => {
    expect(BookingSlugSchema.safeParse("").success).toBe(false);
  });

  it("rejects reserved slug meet", () => {
    expect(BookingSlugSchema.safeParse("meet").success).toBe(false);
  });

  it("rejects every reserved word", () => {
    for (const reserved of [
      "week",
      "day",
      "life",
      "auth",
      "api",
      "cleanup",
      "book",
      "meet",
      "cancel",
      "reschedule",
      "confirmed",
      "p",
      "settings",
      "admin",
      "login",
      "logout",
      "signup",
      "invite",
      "calendar",
    ]) {
      expect(BookingSlugSchema.safeParse(reserved).success).toBe(false);
    }
  });

  it("rejects uppercase characters", () => {
    expect(BookingSlugSchema.safeParse("TylerDane").success).toBe(false);
  });
});

describe("BookingPageSchema", () => {
  it("parses a full admin page JSON", () => {
    expect(BookingPageSchema.safeParse(fullAdminPage()).success).toBe(true);
  });

  it("rejects duration 20", () => {
    expect(
      BookingPageSchema.safeParse({
        ...fullAdminPage(),
        durationMinutes: 20,
      }).success,
    ).toBe(false);
  });

  it("rejects weekday 0 on weekly availability", () => {
    expect(
      BookingPageSchema.safeParse({
        ...fullAdminPage(),
        weeklyAvailability: [{ weekday: 0, start: "09:00", end: "17:00" }],
      }).success,
    ).toBe(false);
  });

  it("rejects maxHorizonDays above 60", () => {
    expect(
      BookingPageSchema.safeParse({
        ...fullAdminPage(),
        maxHorizonDays: 61,
      }).success,
    ).toBe(false);
  });

  it("accepts minNoticeHours at its cap and rejects above", () => {
    const base = {
      enabled: true,
      durationMinutes: 30,
      destinationCalendarId: calendarId(),
      blockingCalendarIds: [calendarId()],
      timeZone: "UTC",
      weeklyAvailability: [{ weekday: 1, start: "09:00", end: "17:00" }],
      minNoticeHours: 4,
      maxHorizonDays: 60,
    };

    expect(
      AdminPutBookingPageInputSchema.safeParse({
        ...base,
        minNoticeHours: BOOKING_MAX_MIN_NOTICE_HOURS,
      }).success,
    ).toBe(true);
    expect(
      AdminPutBookingPageInputSchema.safeParse({
        ...base,
        minNoticeHours: BOOKING_MAX_MIN_NOTICE_HOURS + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects overlapping intervals on the same weekday", () => {
    expect(
      BookingPageSchema.safeParse({
        ...fullAdminPage(),
        weeklyAvailability: [
          { weekday: 2, start: "09:00", end: "12:00" },
          { weekday: 2, start: "11:00", end: "13:00" },
        ],
      }).success,
    ).toBe(false);
  });

  it("allows non-overlapping intervals on different weekdays", () => {
    const page = fullAdminPage();
    expect(BookingPageSchema.safeParse(page).success).toBe(true);
  });
});

describe("PublicBookingPageSchema", () => {
  it("has no calendar ids in the shape", () => {
    const keys = PublicBookingPageSchema.keyof().options;
    expect(keys).toEqual([
      "hostDisplayName",
      "durationMinutes",
      "timeZone",
      "enabled",
      "maxHorizonDays",
      "createsGoogleMeet",
      "conference",
    ]);
  });

  it("projects an admin page without calendar ids or date overrides", () => {
    const admin = BookingPageSchema.parse(fullAdminPage());
    const pub = toPublicBookingPage(admin, "Tyler Dane", "meet");

    expect(PublicBookingPageSchema.safeParse(pub).success).toBe(true);
    expect(pub).toEqual({
      hostDisplayName: "Tyler Dane",
      durationMinutes: 30,
      timeZone: "America/Denver",
      enabled: true,
      maxHorizonDays: 60,
      createsGoogleMeet: true,
      conference: "meet",
    });
    expect(Object.keys(pub)).not.toContain("destinationCalendarId");
    expect(Object.keys(pub)).not.toContain("blockingCalendarIds");
    expect(Object.keys(pub)).not.toContain("dateOverrides");
    expect(Object.keys(pub)).not.toContain("welcomeText");
  });

  it("picks only the admin PUT fields from a full page", () => {
    const page = BookingPageSchema.parse(fullAdminPage());
    expect(pickAdminPutBookingPageInput(page)).toEqual({
      slug: page.slug,
      enabled: page.enabled,
      durationMinutes: page.durationMinutes,
      destinationCalendarId: page.destinationCalendarId,
      blockingCalendarIds: page.blockingCalendarIds,
      timeZone: page.timeZone,
      weeklyAvailability: page.weeklyAvailability,
      minNoticeHours: page.minNoticeHours,
      maxHorizonDays: page.maxHorizonDays,
    });
    expect(pickAdminPutBookingPageInput(page)).not.toHaveProperty("id");
  });
});

describe("removed host settings keys", () => {
  it("strips buffer, max per day, welcome text, and guest invites from admin PUT output", () => {
    const parsed = AdminPutBookingPageInputSchema.parse({
      enabled: true,
      durationMinutes: 30,
      destinationCalendarId: calendarId(),
      blockingCalendarIds: [calendarId()],
      timeZone: "America/Denver",
      weeklyAvailability: [{ weekday: 1, start: "09:00", end: "12:00" }],
      minNoticeHours: 4,
      maxHorizonDays: 60,
      bufferMinutes: 30,
      maxBookingsPerDay: 4,
      welcomeText: "hello",
      guestsCanInviteOthers: true,
    });

    expect(parsed).not.toHaveProperty("bufferMinutes");
    expect(parsed).not.toHaveProperty("maxBookingsPerDay");
    expect(parsed).not.toHaveProperty("welcomeText");
    expect(parsed).not.toHaveProperty("guestsCanInviteOthers");
  });
});

describe("WeeklyAvailabilityIntervalSchema", () => {
  it("rejects end before start", () => {
    expect(
      WeeklyAvailabilityIntervalSchema.safeParse({
        weekday: 1,
        start: "17:00",
        end: "09:00",
      }).success,
    ).toBe(false);
  });
});

describe("buildDefaultAdminPutInput", () => {
  it("seeds an unconfigured page on the placeholder destination", () => {
    const input = buildDefaultAdminPutInput(
      TimeZoneSchema.parse("America/Denver"),
    );
    expect(input).toEqual({
      enabled: false,
      durationMinutes: 30,
      destinationCalendarId: BOOKING_PLACEHOLDER_CALENDAR_ID,
      blockingCalendarIds: [BOOKING_PLACEHOLDER_CALENDAR_ID],
      timeZone: "America/Denver",
      weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
      minNoticeHours: 4,
      maxHorizonDays: BOOKING_MAX_HORIZON_DAYS,
    });
    expect(AdminPutBookingPageInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("DEFAULT_WEEKLY_AVAILABILITY", () => {
  it("parses as five weekday intervals from 09:00 to 17:00", () => {
    const parsed = DEFAULT_WEEKLY_AVAILABILITY;
    expect(parsed).toHaveLength(5);
    expect(parsed.map((interval) => interval.weekday)).toEqual([1, 2, 3, 4, 5]);
    for (const interval of parsed) {
      expect(interval.start).toBe("09:00");
      expect(interval.end).toBe("17:00");
    }
  });
});

describe("allocateBookingSlug", () => {
  it("allocates tylerdane for Tyler Dane when free", () => {
    expect(
      allocateBookingSlug("Tyler Dane", "tyler", "abcdef123456", new Set()),
    ).toBe("tylerdane");
  });

  it("uses the email local-part when the name slugifies too short", () => {
    expect(
      allocateBookingSlug("Al", "ada.lovelace", "abcdef123456", new Set()),
    ).toBe("adalovelace");
  });

  it("uses user plus the user id suffix when still too short", () => {
    expect(allocateBookingSlug("Al", "a", "abcdef123456", new Set())).toBe(
      "user123456",
    );
  });

  it("appends a numeric suffix when the candidate is taken", () => {
    expect(
      allocateBookingSlug(
        "Tyler Dane",
        "tyler",
        "abcdef123456",
        new Set(["tylerdane"]),
      ),
    ).toBe("tylerdane2");
  });

  it("appends a numeric suffix when the candidate is reserved", () => {
    expect(allocateBookingSlug("Week", "week", "abcdef123456", new Set())).toBe(
      "week2",
    );
  });

  it("truncates long candidates to 32 characters before suffixing", () => {
    const longName = "abcdefghijklmnopqrstuvwxyz1234567890extra";
    const slug = allocateBookingSlug(longName, "x", "abcdef123456", new Set());
    expect(slug.length).toBeLessThanOrEqual(32);
    expect(slug).toBe("abcdefghijklmnopqrstuvwxyz123456");
  });
});

describe("HTTP booking contracts", () => {
  it("parses public page and admin responses", () => {
    const admin = fullAdminPage();
    expect(
      PublicGetBookingPageResponseSchema.safeParse({
        hostDisplayName: "Tyler Dane",
        durationMinutes: admin.durationMinutes,
        timeZone: admin.timeZone,
        enabled: admin.enabled,
        maxHorizonDays: admin.maxHorizonDays,
      }).success,
    ).toBe(true);

    expect(
      AdminGetBookingPageResponseSchema.safeParse({
        ...admin,
        bookingUrl: "https://compasscalendar.com/meet/tylerdane",
      }).success,
    ).toBe(true);
  });

  it("parses admin replace input without server-managed fields", () => {
    const admin = fullAdminPage();
    const { id, slug, hostUserId, createdAt, updatedAt, ...replaceInput } =
      admin;

    expect(AdminPutBookingPageInputSchema.safeParse(replaceInput).success).toBe(
      true,
    );
    expect(id).toBeDefined();
    expect(slug).toBeDefined();
  });

  it("accepts an optional slug on admin replace input", () => {
    const admin = fullAdminPage();
    const { id, slug, hostUserId, createdAt, updatedAt, ...replaceInput } =
      admin;

    expect(
      AdminPutBookingPageInputSchema.safeParse({
        ...replaceInput,
        slug: "tyler-dane",
      }).success,
    ).toBe(true);
    expect(
      AdminPutBookingPageInputSchema.safeParse({
        ...replaceInput,
        slug: "tyler-dane",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("requires suggestedSlug on setup response", () => {
    const admin = fullAdminPage();
    const { id, slug, hostUserId, createdAt, updatedAt, ...replaceInput } =
      admin;

    expect(
      AdminGetBookingPageSetupResponseSchema.safeParse({
        ...replaceInput,
        isConfigured: false,
      }).success,
    ).toBe(false);
    expect(
      AdminGetBookingPageSetupResponseSchema.safeParse({
        ...replaceInput,
        isConfigured: false,
        suggestedSlug: "tyler-dane",
      }).success,
    ).toBe(true);
    expect(
      AdminGetBookingPageSetupResponseSchema.safeParse({
        ...replaceInput,
        slug: "tyler-dane",
        isConfigured: false,
        suggestedSlug: "tyler-dane",
      }).success,
    ).toBe(false);
  });

  it("accepts a simple guest email and rejects missing domains", () => {
    expect(isGuestEmail("ada@example.com")).toBe(true);
    expect(isGuestEmail("not-an-email")).toBe(false);
    expect(isGuestEmail("missing@domain")).toBe(false);
  });

  it("parses create reservation input", () => {
    const valid = {
      slotStart: "2026-09-01T15:00:00.000Z",
      guestName: "Ada Lovelace",
      guestEmail: "ada@example.com",
      guestTimeZone: "Europe/London",
      durationMinutes: 30 as const,
    };
    expect(CreateBookingReservationInputSchema.safeParse(valid).success).toBe(
      true,
    );
    expect(
      CreateBookingReservationInputSchema.safeParse({
        slotStart: valid.slotStart,
        guestName: valid.guestName,
        guestEmail: valid.guestEmail,
        guestTimeZone: valid.guestTimeZone,
      }).success,
    ).toBe(false);
    expect(
      CreateBookingReservationInputSchema.safeParse({
        ...valid,
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      CreateBookingReservationInputSchema.safeParse({
        ...valid,
        durationMinutes: 20,
      }).success,
    ).toBe(false);
  });

  it("parses a public reservation GET with name and notes, not email", () => {
    const publicGet = {
      slotStart: "2026-09-01T15:00:00.000Z",
      guestTimeZone: "Europe/London",
      durationMinutes: 30,
      hostDisplayName: "Tyler Dane",
      status: "confirmed",
      bookingSlug: "tylerdane",
      guestName: "Ada Lovelace",
      notes: "bring coffee",
    };
    expect(
      PublicGetBookingReservationResponseSchema.safeParse(publicGet).success,
    ).toBe(true);
    expect(
      PublicGetBookingReservationResponseSchema.parse(publicGet)
        .createsGoogleMeet,
    ).toBe(true);
    expect(
      PublicGetBookingReservationResponseSchema.parse(publicGet).conference,
    ).toBeUndefined();
    expect(
      PublicGetBookingReservationResponseSchema.safeParse({
        slotStart: "2026-09-01T15:00:00.000Z",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
        hostDisplayName: "Tyler Dane",
        status: "confirmed",
        bookingSlug: "tylerdane",
      }).success,
    ).toBe(false);
    expect(
      PublicGetBookingReservationResponseSchema.safeParse({
        ...publicGet,
        guestEmail: "ada@example.com",
      }).success,
    ).toBe(false);
    expect(
      PublicGetBookingReservationResponseSchema.safeParse({
        slotStart: publicGet.slotStart,
        guestTimeZone: publicGet.guestTimeZone,
        durationMinutes: publicGet.durationMinutes,
        hostDisplayName: publicGet.hostDisplayName,
        status: publicGet.status,
        guestName: publicGet.guestName,
        notes: publicGet.notes,
      }).success,
    ).toBe(true);
  });

  it("parses a guest details PATCH and rejects email or empty edits", () => {
    expect(
      PatchBookingReservationInputSchema.safeParse({
        token: "abc",
        name: "Grace Hopper",
        notes: "bring tea",
      }).success,
    ).toBe(true);
    expect(
      PatchBookingReservationInputSchema.safeParse({
        token: "abc",
        notes: "",
      }).success,
    ).toBe(true);
    expect(
      PatchBookingReservationInputSchema.safeParse({
        token: "abc",
      }).success,
    ).toBe(false);
    expect(
      PatchBookingReservationInputSchema.safeParse({
        token: "abc",
        name: "Ada Lovelace",
        guestEmail: "ada@example.com",
      }).success,
    ).toBe(false);
  });

  it("requires rescheduleUrl on create reservation responses", () => {
    const created = {
      reservationId: objectId(),
      slotStart: "2026-09-01T15:00:00.000Z",
      slotEnd: "2026-09-01T15:30:00.000Z",
      guestTimeZone: "Europe/London",
      cancelUrl:
        "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
      rescheduleUrl:
        "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
    };
    expect(
      CreateBookingReservationResponseSchema.safeParse(created).success,
    ).toBe(true);
    expect(
      CreateBookingReservationResponseSchema.safeParse({
        reservationId: created.reservationId,
        slotStart: created.slotStart,
        slotEnd: created.slotEnd,
        guestTimeZone: created.guestTimeZone,
        cancelUrl: created.cancelUrl,
      }).success,
    ).toBe(false);
  });

  it("parses reschedule input and rejects extra keys", () => {
    expect(
      RescheduleBookingReservationInputSchema.safeParse({
        token: "abc",
        slotStart: "2026-09-01T15:00:00.000Z",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
      }).success,
    ).toBe(true);
    expect(
      RescheduleBookingReservationInputSchema.safeParse({
        token: "abc",
        slotStart: "2026-09-01T15:00:00.000Z",
        guestTimeZone: "Europe/London",
      }).success,
    ).toBe(false);
    expect(
      RescheduleBookingReservationInputSchema.safeParse({
        token: "abc",
        slotStart: "2026-09-01T15:00:00.000Z",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
        notes: "extra",
      }).success,
    ).toBe(false);
  });

  it("parses a reschedule response with the updated slot", () => {
    expect(
      RescheduleBookingReservationResponseSchema.safeParse({
        reservationId: objectId(),
        slotStart: "2026-09-02T15:00:00.000Z",
        slotEnd: "2026-09-02T15:30:00.000Z",
        guestTimeZone: "Europe/London",
        durationMinutes: 30,
        hostDisplayName: "Tyler Dane",
        status: "confirmed",
        bookingSlug: "tylerdane",
      }).success,
    ).toBe(true);
  });

  it("parses tokenized reservation slots query and rejects extra keys", () => {
    expect(
      BookingReservationSlotsQuerySchema.safeParse({
        token: "abc",
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-09-30T00:00:00.000Z",
        timeZone: "Europe/London",
      }).success,
    ).toBe(true);
    expect(
      BookingReservationSlotsQuerySchema.safeParse({
        token: "abc",
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-09-30T00:00:00.000Z",
        timeZone: "Europe/London",
        slug: "tylerdane",
      }).success,
    ).toBe(false);
  });

  it("keeps cancel input as token only", () => {
    expect(
      CancelBookingReservationInputSchema.safeParse({ token: "abc" }).success,
    ).toBe(true);
    expect(
      CancelBookingReservationInputSchema.safeParse({
        token: "abc",
        slotStart: "2026-09-01T15:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects reserved slug confirmed", () => {
    expect(BookingSlugSchema.safeParse("confirmed").success).toBe(false);
    expect(BookingSlugSchema.safeParse("cancel").success).toBe(false);
  });

  it("rejects reserved slug reschedule", () => {
    expect(BookingSlugSchema.safeParse("reschedule").success).toBe(false);
  });
});

describe("BookingNewMeetingsClaimResponseSchema", () => {
  it("accepts an empty claim", () => {
    expect(
      BookingNewMeetingsClaimResponseSchema.safeParse({ reservations: [] })
        .success,
    ).toBe(true);
  });

  it("accepts a confirmed reservation payload", () => {
    expect(
      BookingNewMeetingsClaimResponseSchema.safeParse({
        reservations: [
          {
            id: objectId(),
            guestName: "Bob",
            slotStart: dateTime(),
            slotEnd: "2026-08-30T12:30:00.000Z",
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("BookingPageStatusResponseSchema", () => {
  it("accepts a bookable empty status", () => {
    expect(
      BookingPageStatusResponseSchema.safeParse({
        bookable: true,
        reasons: [],
      }).success,
    ).toBe(true);
  });

  it("accepts calendar, connection, and billing reasons", () => {
    expect(
      BookingPageStatusResponseSchema.safeParse({
        bookable: false,
        reasons: [
          {
            kind: "calendar",
            reason: "stale",
            calendarId: calendarId(),
          },
          {
            kind: "connection",
            reason: "actionRequired",
            connectionState: "actionRequired",
            provider: "google",
          },
          { kind: "billing", reason: "BILLING_REQUIRED" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects invented reason strings", () => {
    expect(
      BookingPageStatusResponseSchema.safeParse({
        bookable: false,
        reasons: [{ kind: "calendar", reason: "offline" }],
      }).success,
    ).toBe(false);
  });
});
