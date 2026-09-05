import { expect, type Page } from "@playwright/test";

/** ObjectId-shaped id for stubbed Google calendar in host settings e2e. */
export const BOOKING_CALENDAR_ID = "64b7f0a1c2d3e4f5a6b7c8d9";

/** ObjectId-shaped id for the stubbed Compass-local calendar. */
export const COMPASS_CALENDAR_ID = "64b7f0a1c2d3e4f5a6b7c8e0";

/** ObjectId-shaped id for a stubbed Apple iCloud calendar. */
export const APPLE_BOOKING_CALENDAR_ID = "64b7f0a1c2d3e4f5a6b7c8e1";

/** ObjectId-shaped id for a stubbed Microsoft Outlook calendar. */
export const MICROSOFT_BOOKING_CALENDAR_ID = "64b7f0a1c2d3e4f5a6b7c8e2";

export const HOST_ACCOUNT_EMAIL = "host@example.com";
export const APPLE_ACCOUNT_EMAIL = "host@icloud.com";
export const MICROSOFT_ACCOUNT_EMAIL = "host@outlook.com";

/** Stub calendar list entry for an Apple booking destination. */
export const appleBookingCalendar = {
  id: APPLE_BOOKING_CALENDAR_ID,
  name: "Personal",
  description: "",
  timeZone: "America/Chicago",
  foregroundColor: "#ffffff",
  backgroundColor: "#8E8E93",
  provider: "apple" as const,
  access: "owner" as const,
  capabilities: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: true,
    canWatchEvents: true,
    canInviteAttendees: true,
    conferenceKinds: [],
  },
  isPrimary: true,
  isVisible: true,
  isActive: true,
  createsGoogleMeet: false,
  conference: "none" as const,
  accountEmail: APPLE_ACCOUNT_EMAIL,
};

/** Stub calendar list entry for a Microsoft booking destination with Teams. */
export const microsoftBookingCalendar = {
  id: MICROSOFT_BOOKING_CALENDAR_ID,
  name: "Work",
  description: "",
  timeZone: "America/Chicago",
  foregroundColor: "#ffffff",
  backgroundColor: "#0078D4",
  provider: "microsoft" as const,
  access: "owner" as const,
  capabilities: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: true,
    canWatchEvents: true,
    canInviteAttendees: true,
    conferenceKinds: ["teams"] as const,
  },
  isPrimary: true,
  isVisible: true,
  isActive: true,
  createsGoogleMeet: false,
  conference: "teams" as const,
  accountEmail: MICROSOFT_ACCOUNT_EMAIL,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

const googleCalendar = {
  id: BOOKING_CALENDAR_ID,
  name: "Work",
  description: "",
  timeZone: "America/Chicago",
  foregroundColor: "#ffffff",
  backgroundColor: "#4285f4",
  provider: "google",
  access: "owner",
  capabilities: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: true,
    canWatchEvents: true,
    canInviteAttendees: true,
    conferenceKinds: ["meet"],
  },
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail: HOST_ACCOUNT_EMAIL,
};

const compassCalendar = {
  id: COMPASS_CALENDAR_ID,
  name: "Compass",
  description: "",
  timeZone: "America/Chicago",
  foregroundColor: "#000000",
  backgroundColor: "#ffffff",
  provider: "local",
  access: "owner",
  capabilities: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: true,
    canWatchEvents: true,
    canInviteAttendees: true,
    conferenceKinds: [],
  },
  isPrimary: false,
  isVisible: true,
  isActive: true,
};

function monthKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

/** A slot later in the current UTC month, inside today's remaining hours when the month is ending. */
export function buildBookableSlot(durationMinutes = 30): {
  slotStart: string;
  slotEnd: string;
} {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() + 2);
  start.setUTCHours(12, 0, 0, 0);
  const sameUtcMonth =
    start.getUTCMonth() === now.getUTCMonth() &&
    start.getUTCFullYear() === now.getUTCFullYear();
  if (!sameUtcMonth || start.getTime() <= now.getTime()) {
    start.setTime(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        12,
        0,
        0,
        0,
      ),
    );
    if (
      start.getTime() <= now.getTime() ||
      start.getUTCMonth() !== now.getUTCMonth()
    ) {
      // Noon UTC is past. Stay on today rather than +2h, which is 12:00 AM
      // the next Berlin day on month-end evenings.
      start.setTime(now.getTime() + 20 * 60 * 1000);
      start.setUTCSeconds(0, 0);
      start.setUTCMilliseconds(0);
      const berlinNow = monthKeyInZone(now, "Europe/Berlin");
      if (
        start.getUTCMonth() === now.getUTCMonth() &&
        monthKeyInZone(start, "Europe/Berlin") !== berlinNow &&
        berlinNow === monthKeyInZone(now, "UTC")
      ) {
        start.setTime(now.getTime() + 60 * 1000);
        start.setUTCSeconds(0, 0);
        start.setUTCMilliseconds(0);
      }
      if (start.getUTCMonth() !== now.getUTCMonth()) {
        start.setTime(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            23,
            59,
            0,
            0,
          ),
        );
      }
    }
  }
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { slotStart: start.toISOString(), slotEnd: end.toISOString() };
}

/** Distinct sibling on the same UTC date. Steps backward when +gap would cross midnight. */
export function buildSameDaySiblingSlot(
  slot: { slotStart: string; slotEnd: string },
  gapMinutes = 30,
  durationMinutes = 30,
): { slotStart: string; slotEnd: string } {
  const currentMs = Date.parse(slot.slotStart);
  const day = slot.slotStart.slice(0, 10);
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const lastStart = Date.parse(`${day}T23:59:00.000Z`);
  let siblingMs = currentMs + gapMinutes * 60 * 1000;
  if (siblingMs > lastStart || siblingMs === currentMs) {
    siblingMs = currentMs - gapMinutes * 60 * 1000;
  }
  if (siblingMs < dayStart) {
    siblingMs = dayStart;
  }
  const siblingStart = new Date(siblingMs);
  siblingStart.setUTCSeconds(0, 0);
  siblingStart.setUTCMilliseconds(0);
  return {
    slotStart: siblingStart.toISOString(),
    slotEnd: new Date(
      siblingStart.getTime() + durationMinutes * 60 * 1000,
    ).toISOString(),
  };
}

/**
 * Next Saturday at 15:00 UTC. 15:00 UTC stays Saturday in US and
 * European Playwright timezones.
 */
export function buildUpcomingSaturdaySlot(durationMinutes = 30): {
  slotStart: string;
  slotEnd: string;
} {
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      15,
      0,
      0,
      0,
    ),
  );
  const daysUntilSaturday = (6 - start.getUTCDay() + 7) % 7;
  if (daysUntilSaturday === 0 && start.getTime() <= now.getTime()) {
    start.setUTCDate(start.getUTCDate() + 7);
  } else {
    start.setUTCDate(start.getUTCDate() + daysUntilSaturday);
  }
  if (start.getTime() <= now.getTime()) {
    start.setUTCDate(start.getUTCDate() + 7);
  }
  return {
    slotStart: start.toISOString(),
    slotEnd: new Date(
      start.getTime() + durationMinutes * 60 * 1000,
    ).toISOString(),
  };
}

export interface PublicBookingStubOptions {
  slug?: string;
  hostDisplayName?: string;
  durationMinutes?: number;
  welcomeText?: string | null;
  slots?: Array<{ slotStart: string; slotEnd: string }>;
  bookable?: boolean;
  /** When set, POST /reservations returns this status instead of 200. */
  confirmStatus?: number;
  /** When set, the reservation POST waits until this resolves (for in-flight UI). */
  holdConfirm?: Promise<void>;
  /** When true, slot GETs return 500 until `slotFailGate.fail` is set false. */
  slotFailGate?: { fail: boolean };
  /** When set, the first slot GET waits until this resolves. */
  holdFirstSlots?: Promise<void>;
  /** Public GET reservation status. Defaults to confirmed. */
  reservationStatus?: "confirmed" | "cancelled";
  /** When true, GET /reservations/:id returns 404. */
  reservationNotFound?: boolean;
  /** When set, GET /reservations/:id returns this status instead of 200. */
  reservationGetStatus?: number;
  /** Confirmation permalink `?token=`. Omit for a cold load with no secret. */
  token?: string;
  guestName?: string;
  notes?: string | null;
  conference?: "meet" | "teams" | "none";
  createsGoogleMeet?: boolean;
}

export interface CapturedBookingRequests {
  reservationPosts: Array<Record<string, unknown>>;
  reservationPatches: Array<Record<string, unknown>>;
  reschedulePosts: Array<Record<string, unknown>>;
  slotGets: number;
  reservationSlotGets: number;
  slotQueries: Array<{ start: string | null; end: string | null }>;
}

function reservationPayload(input: {
  slotStart: string;
  guestTimeZone: string;
  durationMinutes: number;
  hostDisplayName: string;
  status: "confirmed" | "cancelled";
  bookingSlug: string;
  guestName: string;
  notes: string | null;
  conference?: "meet" | "teams" | "none";
  createsGoogleMeet?: boolean;
}) {
  const conference = input.conference ?? "meet";
  return {
    slotStart: input.slotStart,
    guestTimeZone: input.guestTimeZone,
    durationMinutes: input.durationMinutes,
    hostDisplayName: input.hostDisplayName,
    status: input.status,
    bookingSlug: input.bookingSlug,
    guestName: input.guestName,
    notes: input.notes,
    conference,
    createsGoogleMeet: input.createsGoogleMeet ?? conference === "meet",
  };
}

function applyReservationPatch(
  body: Record<string, unknown>,
  current: { guestName: string; notes: string | null },
): { guestName: string; notes: string | null } {
  const guestName =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim()
      : current.guestName;
  const notes = typeof body.notes === "string" ? body.notes : current.notes;
  return { guestName, notes };
}

/**
 * Stub public booking APIs for the shipped two-pane picker: month-window
 * slot GETs (filtered by `start`/`end`), day-scoped slot buttons, the
 * details step, confirmation permalink GET, guest details PATCH, and
 * cancel POST-on-confirm.
 */
export async function preparePublicBookingPage(
  page: Page,
  options: PublicBookingStubOptions = {},
): Promise<CapturedBookingRequests> {
  const slug = options.slug ?? "tylerdane";
  const captured: CapturedBookingRequests = {
    reservationPosts: [],
    reservationPatches: [],
    reschedulePosts: [],
    slotGets: 0,
    reservationSlotGets: 0,
    slotQueries: [],
  };
  const reservationId = "000000000000000000000099";
  const slot =
    options.slots?.[0] ?? buildBookableSlot(options.durationMinutes ?? 30);
  const slots = options.slots ?? [slot];
  const hostDisplayName = options.hostDisplayName ?? "Tyler Dane";
  const durationMinutes = options.durationMinutes ?? 30;
  const conference = options.conference ?? "meet";
  const createsGoogleMeet = options.createsGoogleMeet ?? conference === "meet";
  let guestName = options.guestName ?? "Guest User";
  let notes = options.notes ?? null;
  let postedSlotStart = slot.slotStart;
  let postedSlotEnd = slot.slotEnd;
  let postedTimeZone = "UTC";

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === `/api/booking/pages/${slug}` && request.method() === "GET") {
      return route.fulfill(
        jsonResponse({
          hostDisplayName,
          durationMinutes,
          timeZone: "America/Chicago",
          enabled: true,
          maxHorizonDays: 60,
          welcomeText: options.welcomeText ?? null,
          conference,
          createsGoogleMeet,
        }),
      );
    }

    if (
      path === `/api/booking/pages/${slug}/slots` &&
      request.method() === "GET"
    ) {
      captured.slotGets += 1;
      const windowStart = url.searchParams.get("start");
      const windowEnd = url.searchParams.get("end");
      captured.slotQueries.push({
        start: windowStart,
        end: windowEnd,
      });
      if (options.holdFirstSlots && captured.slotGets === 1) {
        await options.holdFirstSlots;
      }
      if (options.slotFailGate?.fail) {
        return route.fulfill(jsonResponse({}, 500));
      }
      const startMs = windowStart ? Date.parse(windowStart) : Number.NaN;
      const endMs = windowEnd ? Date.parse(windowEnd) : Number.NaN;
      const slotsInWindow = slots.filter((entry) => {
        const slotMs = Date.parse(entry.slotStart);
        return slotMs >= startMs && slotMs < endMs;
      });
      return route.fulfill(
        jsonResponse({
          bookable: options.bookable ?? true,
          slots: slotsInWindow,
        }),
      );
    }

    if (
      path === `/api/booking/pages/${slug}/reservations` &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      captured.reservationPosts.push(body);
      if (options.holdConfirm) {
        await options.holdConfirm;
      }
      if (options.confirmStatus === 409) {
        return route.fulfill(jsonResponse({}, 409));
      }
      if (typeof body.guestName === "string") {
        guestName = body.guestName;
      }
      notes = typeof body.notes === "string" ? body.notes : null;
      if (typeof body.slotStart === "string") {
        postedSlotStart = body.slotStart;
      }
      if (typeof body.guestTimeZone === "string") {
        postedTimeZone = body.guestTimeZone;
      }
      return route.fulfill(
        jsonResponse({
          reservationId,
          slotStart: body.slotStart,
          slotEnd: postedSlotEnd,
          guestTimeZone: body.guestTimeZone,
          cancelUrl: `https://compasscalendar.com/book/cancel/${reservationId}?token=abc`,
          rescheduleUrl: `https://compasscalendar.com/book/reschedule/${reservationId}?token=abc`,
        }),
      );
    }

    if (
      path === `/api/booking/reservations/${reservationId}/slots` &&
      request.method() === "GET"
    ) {
      captured.reservationSlotGets += 1;
      const windowStart = url.searchParams.get("start");
      const windowEnd = url.searchParams.get("end");
      captured.slotQueries.push({
        start: windowStart,
        end: windowEnd,
      });
      const startMs = windowStart ? Date.parse(windowStart) : Number.NaN;
      const endMs = windowEnd ? Date.parse(windowEnd) : Number.NaN;
      const slotsInWindow = slots.filter((entry) => {
        const slotMs = Date.parse(entry.slotStart);
        return slotMs >= startMs && slotMs < endMs;
      });
      return route.fulfill(
        jsonResponse({
          bookable: options.bookable ?? true,
          slots: slotsInWindow,
        }),
      );
    }

    if (
      path === `/api/booking/reservations/${reservationId}/reschedule` &&
      request.method() === "POST"
    ) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      captured.reschedulePosts.push(body);
      if (typeof body.slotStart === "string") {
        postedSlotStart = body.slotStart;
        const matched = slots.find(
          (entry) => entry.slotStart === body.slotStart,
        );
        postedSlotEnd =
          matched?.slotEnd ??
          new Date(
            Date.parse(postedSlotStart) + durationMinutes * 60 * 1000,
          ).toISOString();
      }
      if (typeof body.guestTimeZone === "string") {
        postedTimeZone = body.guestTimeZone;
      }
      return route.fulfill(
        jsonResponse({
          reservationId,
          slotStart: postedSlotStart,
          slotEnd: postedSlotEnd,
          guestTimeZone: postedTimeZone,
          durationMinutes,
          hostDisplayName,
          status: "confirmed",
          bookingSlug: slug,
        }),
      );
    }

    if (
      /^\/api\/booking\/reservations\/[^/]+$/.test(path) &&
      request.method() === "PATCH"
    ) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      captured.reservationPatches.push(body);
      const next = applyReservationPatch(body, { guestName, notes });
      guestName = next.guestName;
      notes = next.notes;
      return route.fulfill(
        jsonResponse(
          reservationPayload({
            slotStart: postedSlotStart,
            guestTimeZone: postedTimeZone,
            durationMinutes,
            hostDisplayName,
            status: options.reservationStatus ?? "confirmed",
            bookingSlug: slug,
            guestName,
            notes,
            conference,
            createsGoogleMeet,
          }),
        ),
      );
    }

    if (
      /^\/api\/booking\/reservations\/[^/]+$/.test(path) &&
      request.method() === "GET"
    ) {
      if (options.reservationNotFound) {
        return route.fulfill(jsonResponse({}, 404));
      }
      return route.fulfill(
        jsonResponse(
          reservationPayload({
            slotStart: postedSlotStart,
            guestTimeZone: postedTimeZone,
            durationMinutes,
            hostDisplayName,
            status: options.reservationStatus ?? "confirmed",
            bookingSlug: slug,
            guestName,
            notes,
            conference,
            createsGoogleMeet,
          }),
        ),
      );
    }

    return route.fulfill(jsonResponse({}));
  });

  await page.goto(`/book/${slug}`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Book with Tyler Dane" }),
  ).toBeVisible({ timeout: 15000 });
  // The h1 renders before the slots request settles, and while slots are
  // pending the picker shows a skeleton without the "Pick a time" heading.
  // A test that starts typing right away (Tab to the skip link, Enter) would
  // race that request: the skip link finds no target and focus goes nowhere.
  // Wait for the picker itself unless the test is deliberately observing the
  // pending, failed, or unavailable state.
  if (
    options.bookable !== false &&
    !options.slotFailGate &&
    !options.holdFirstSlots
  ) {
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
  }

  return captured;
}

export async function preparePublicBookingConfirmedPage(
  page: Page,
  options: PublicBookingStubOptions & { reservationId?: string } = {},
): Promise<CapturedBookingRequests> {
  const reservationId = options.reservationId ?? "000000000000000000000099";
  const slot =
    options.slots?.[0] ?? buildBookableSlot(options.durationMinutes ?? 30);
  const hostDisplayName = options.hostDisplayName ?? "Tyler Dane";
  const durationMinutes = options.durationMinutes ?? 30;
  const slug = options.slug ?? "tylerdane";
  const conference = options.conference ?? "meet";
  const createsGoogleMeet = options.createsGoogleMeet ?? conference === "meet";
  let guestName = options.guestName ?? "Guest User";
  let notes = options.notes ?? null;
  const captured: CapturedBookingRequests = {
    reservationPosts: [],
    reservationPatches: [],
    reschedulePosts: [],
    slotGets: 0,
    reservationSlotGets: 0,
    slotQueries: [],
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      /^\/api\/booking\/reservations\/[^/]+$/.test(path) &&
      request.method() === "PATCH"
    ) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      captured.reservationPatches.push(body);
      const next = applyReservationPatch(body, { guestName, notes });
      guestName = next.guestName;
      notes = next.notes;
      return route.fulfill(
        jsonResponse(
          reservationPayload({
            slotStart: slot.slotStart,
            guestTimeZone: "UTC",
            durationMinutes,
            hostDisplayName,
            status: options.reservationStatus ?? "confirmed",
            bookingSlug: slug,
            guestName,
            notes,
            conference,
            createsGoogleMeet,
          }),
        ),
      );
    }

    if (
      /^\/api\/booking\/reservations\/[^/]+$/.test(path) &&
      request.method() === "GET"
    ) {
      if (options.reservationNotFound) {
        return route.fulfill(jsonResponse({}, 404));
      }
      if (options.reservationGetStatus) {
        return route.fulfill(jsonResponse({}, options.reservationGetStatus));
      }
      return route.fulfill(
        jsonResponse(
          reservationPayload({
            slotStart: slot.slotStart,
            guestTimeZone: "UTC",
            durationMinutes,
            hostDisplayName,
            status: options.reservationStatus ?? "confirmed",
            bookingSlug: slug,
            guestName,
            notes,
            conference,
            createsGoogleMeet,
          }),
        ),
      );
    }

    return route.fulfill(jsonResponse({}));
  });

  const search = options.token
    ? `?token=${encodeURIComponent(options.token)}`
    : "";
  await page.goto(`/book/confirmed/${reservationId}${search}`, {
    waitUntil: "domcontentloaded",
  });

  return captured;
}

export interface PublicBookingCancelStubOptions {
  reservationId?: string;
  token?: string;
  /** HTTP status for POST /reservations/:id/cancel. Default 200. */
  cancelStatus?: number;
  /** When set, the cancel POST waits until this resolves (for in-flight UI). */
  holdCancel?: Promise<void>;
  durationMinutes?: number;
  slotStart?: string;
  guestTimeZone?: string;
  hostDisplayName?: string;
  /** Public GET reservation status. Defaults to confirmed. */
  reservationStatus?: "confirmed" | "cancelled";
  /** When true, GET /reservations/:id returns 404. */
  reservationNotFound?: boolean;
  /** When set, GET /reservations/:id returns this status instead of 200. */
  reservationGetStatus?: number;
}

export interface CapturedCancelRequests {
  cancelPosts: Array<Record<string, unknown>>;
}

export async function preparePublicBookingCancelPage(
  page: Page,
  options: PublicBookingCancelStubOptions = {},
): Promise<CapturedCancelRequests> {
  const reservationId = options.reservationId ?? "000000000000000000000099";
  const token = options.token ?? "abc";
  const captured: CapturedCancelRequests = { cancelPosts: [] };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      path === `/api/booking/reservations/${reservationId}` &&
      request.method() === "GET"
    ) {
      if (options.reservationNotFound) {
        return route.fulfill(jsonResponse({}, 404));
      }
      if (options.reservationGetStatus) {
        return route.fulfill(jsonResponse({}, options.reservationGetStatus));
      }
      const slot = buildBookableSlot(options.durationMinutes ?? 30);
      return route.fulfill(
        jsonResponse({
          slotStart: options.slotStart ?? slot.slotStart,
          guestTimeZone: options.guestTimeZone ?? "UTC",
          durationMinutes: options.durationMinutes ?? 30,
          hostDisplayName: options.hostDisplayName ?? "Tyler Dane",
          status: options.reservationStatus ?? "confirmed",
          bookingSlug: "tylerdane",
          guestName: "Guest User",
          notes: null,
        }),
      );
    }

    if (
      path === `/api/booking/reservations/${reservationId}/cancel` &&
      request.method() === "POST"
    ) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      captured.cancelPosts.push(body);
      if (options.holdCancel) {
        await options.holdCancel;
      }
      const status = options.cancelStatus ?? 200;
      return route.fulfill(
        jsonResponse(status === 200 ? { ok: true } : {}, status),
      );
    }

    return route.fulfill(jsonResponse({}));
  });

  const search = token ? `?token=${encodeURIComponent(token)}` : "";
  await page.goto(`/book/cancel/${reservationId}${search}`, {
    waitUntil: "domcontentloaded",
  });

  return captured;
}

export interface PublicBookingRescheduleStubOptions {
  reservationId?: string;
  token?: string;
  durationMinutes?: number;
  slots?: Array<{ slotStart: string; slotEnd: string }>;
  bookable?: boolean;
  /** HTTP status for POST /reservations/:id/reschedule. Default 200. */
  rescheduleStatus?: number;
  /** When set, the reschedule POST waits until this resolves (for in-flight UI). */
  holdReschedule?: Promise<void>;
  guestTimeZone?: string;
  hostDisplayName?: string;
  slug?: string;
  /** Public GET reservation status. Defaults to confirmed. */
  reservationStatus?: "confirmed" | "cancelled";
  /** When true, GET /reservations/:id returns 404. */
  reservationNotFound?: boolean;
  /** When set, GET /reservations/:id returns this status instead of 200. */
  reservationGetStatus?: number;
}

export interface CapturedRescheduleRequests {
  reschedulePosts: Array<Record<string, unknown>>;
  reservationSlotGets: number;
}

export async function preparePublicBookingReschedulePage(
  page: Page,
  options: PublicBookingRescheduleStubOptions = {},
): Promise<CapturedRescheduleRequests> {
  const reservationId = options.reservationId ?? "000000000000000000000099";
  const token = options.token ?? "abc";
  const slug = options.slug ?? "tylerdane";
  const durationMinutes = options.durationMinutes ?? 30;
  const hostDisplayName = options.hostDisplayName ?? "Tyler Dane";
  const first = options.slots?.[0] ?? buildBookableSlot(durationMinutes);
  const slots = options.slots ?? [first];
  let currentSlotStart = first.slotStart;
  let currentSlotEnd = first.slotEnd;
  let guestTimeZone = options.guestTimeZone ?? "UTC";
  const captured: CapturedRescheduleRequests = {
    reschedulePosts: [],
    reservationSlotGets: 0,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === `/api/booking/pages/${slug}` && request.method() === "GET") {
      return route.fulfill(
        jsonResponse({
          hostDisplayName,
          durationMinutes,
          timeZone: "America/Chicago",
          enabled: true,
          maxHorizonDays: 60,
          welcomeText: null,
        }),
      );
    }

    if (
      path === `/api/booking/reservations/${reservationId}` &&
      request.method() === "GET"
    ) {
      if (options.reservationNotFound) {
        return route.fulfill(jsonResponse({}, 404));
      }
      if (options.reservationGetStatus) {
        return route.fulfill(jsonResponse({}, options.reservationGetStatus));
      }
      return route.fulfill(
        jsonResponse({
          slotStart: currentSlotStart,
          guestTimeZone,
          durationMinutes,
          hostDisplayName,
          status: options.reservationStatus ?? "confirmed",
          bookingSlug: slug,
          guestName: "Guest User",
          notes: null,
        }),
      );
    }

    if (
      path === `/api/booking/reservations/${reservationId}/slots` &&
      request.method() === "GET"
    ) {
      captured.reservationSlotGets += 1;
      const windowStart = url.searchParams.get("start");
      const windowEnd = url.searchParams.get("end");
      const startMs = windowStart ? Date.parse(windowStart) : Number.NaN;
      const endMs = windowEnd ? Date.parse(windowEnd) : Number.NaN;
      const slotsInWindow = slots.filter((entry) => {
        const slotMs = Date.parse(entry.slotStart);
        return slotMs >= startMs && slotMs < endMs;
      });
      return route.fulfill(
        jsonResponse({
          bookable: options.bookable ?? true,
          slots: slotsInWindow,
        }),
      );
    }

    if (
      path === `/api/booking/reservations/${reservationId}/reschedule` &&
      request.method() === "POST"
    ) {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      captured.reschedulePosts.push(body);
      if (options.holdReschedule) {
        await options.holdReschedule;
      }
      const status = options.rescheduleStatus ?? 200;
      if (status !== 200) {
        return route.fulfill(jsonResponse({}, status));
      }
      if (typeof body.slotStart === "string") {
        currentSlotStart = body.slotStart;
        const matched = slots.find(
          (entry) => entry.slotStart === body.slotStart,
        );
        currentSlotEnd =
          matched?.slotEnd ??
          new Date(
            Date.parse(currentSlotStart) + durationMinutes * 60 * 1000,
          ).toISOString();
      }
      if (typeof body.guestTimeZone === "string") {
        guestTimeZone = body.guestTimeZone;
      }
      return route.fulfill(
        jsonResponse({
          reservationId,
          slotStart: currentSlotStart,
          slotEnd: currentSlotEnd,
          guestTimeZone,
          durationMinutes,
          hostDisplayName,
          status: "confirmed",
          bookingSlug: slug,
        }),
      );
    }

    return route.fulfill(jsonResponse({}));
  });

  const search = token ? `?token=${encodeURIComponent(token)}` : "";
  await page.goto(`/book/reschedule/${reservationId}${search}`, {
    waitUntil: "domcontentloaded",
  });

  return captured;
}

export interface HostBookingSettingsStubOptions {
  slug?: string;
  bookingUrl?: string;
  microsoftConnect?: boolean;
}

export interface CapturedHostBookingRequests {
  putBodies: Array<Record<string, unknown>>;
}

export async function prepareSignedInBookingSettingsPage(
  page: Page,
  options: HostBookingSettingsStubOptions = {},
): Promise<CapturedHostBookingRequests> {
  const slug = options.slug ?? "hostuser";
  const bookingUrl =
    options.bookingUrl ?? `https://compasscalendar.com/book/${slug}`;
  const captured: CapturedHostBookingRequests = { putBodies: [] };

  await page.addInitScript((accountEmail) => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
    localStorage.setItem(
      "compass.auth",
      JSON.stringify({ hasAuthenticated: true, lastKnownEmail: accountEmail }),
    );
  }, HOST_ACCOUNT_EMAIL);

  const bookingPagePayload = {
    enabled: false,
    durationMinutes: 45,
    destinationCalendarId: BOOKING_CALENDAR_ID,
    blockingCalendarIds: [BOOKING_CALENDAR_ID],
    timeZone: "America/New_York",
    weeklyAvailability: [],
    welcomeText: null,
    minNoticeHours: 4,
    maxHorizonDays: 60,
    bufferMinutes: null,
    maxBookingsPerDay: null,
    guestsCanInviteOthers: true,
  };

  const savedPageFields = {
    id: "000000000000000000000001",
    slug,
    hostUserId: "000000000000000000000002",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    bookingUrl,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/api/calendars")) {
      return route.fulfill(
        jsonResponse({ calendars: [googleCalendar, compassCalendar] }),
      );
    }

    if (path.endsWith("/api/event") && request.method() === "GET") {
      return route.fulfill(jsonResponse({ events: [] }));
    }

    if (path.endsWith("/api/booking/page") && request.method() === "GET") {
      // The saved-page shape, which is what the real GET returns once a slug
      // exists. Returning the bare input shape here hid a bug where the
      // response-only keys rode into the strict PUT schema and killed every
      // save after the first.
      return route.fulfill(
        jsonResponse({ ...bookingPagePayload, ...savedPageFields }),
      );
    }

    if (path.endsWith("/api/booking/page") && request.method() === "PUT") {
      const body = request.postDataJSON() as Record<string, unknown>;
      captured.putBodies.push(body);
      return route.fulfill(
        jsonResponse({
          ...bookingPagePayload,
          ...savedPageFields,
          ...body,
        }),
      );
    }

    if (path.endsWith("/api/user/metadata")) {
      return route.fulfill(
        jsonResponse({
          google: {
            connectionState: "HEALTHY",
            connections: [
              {
                id: "e2e-connection-1",
                state: "healthy",
                stateReason: null,
                lastSyncedAt: null,
                lastHealthyAt: null,
                accountEmail: HOST_ACCOUNT_EMAIL,
                connectionState: "HEALTHY",
                canSuggestContacts: false,
              },
            ],
          },
        }),
      );
    }

    if (path.endsWith("/api/config")) {
      return route.fulfill(
        jsonResponse({
          google: { isConfigured: true },
          providers: {
            google: { signIn: true, connect: true },
            microsoft: {
              signIn: false,
              connect: Boolean(options.microsoftConnect),
            },
            apple: { signIn: false, connect: false },
          },
        }),
      );
    }

    return route.fulfill(jsonResponse({}));
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { level: 1 }).getByRole("button"),
  ).toBeVisible({ timeout: 15000 });

  await page.waitForFunction(
    () =>
      (
        window as Window & {
          __COMPASS_E2E_HOOKS__?: { setAuthenticated: (v: boolean) => void };
        }
      ).__COMPASS_E2E_HOOKS__ !== undefined,
  );
  await page.evaluate(() => {
    (
      window as Window & {
        __COMPASS_E2E_HOOKS__?: { setAuthenticated: (v: boolean) => void };
      }
    ).__COMPASS_E2E_HOOKS__?.setAuthenticated(true);
  });

  await page.waitForFunction(() => {
    const bridge = (
      window as Window & {
        __COMPASS_E2E_STORE__?: { userMetadata?: unknown };
      }
    ).__COMPASS_E2E_STORE__;
    return Boolean(bridge?.userMetadata);
  });
  await page.evaluate(
    (metadata) => {
      const bridge = (
        window as Window & {
          __COMPASS_E2E_STORE__?: {
            userMetadata?: { set: (metadata: unknown) => void };
          };
        }
      ).__COMPASS_E2E_STORE__;
      bridge?.userMetadata?.set(metadata);
    },
    {
      google: {
        connectionState: "HEALTHY",
        connections: [
          {
            id: "e2e-connection-1",
            state: "healthy",
            stateReason: null,
            lastSyncedAt: null,
            lastHealthyAt: null,
            accountEmail: HOST_ACCOUNT_EMAIL,
            connectionState: "HEALTHY",
            canSuggestContacts: false,
          },
        ],
      },
    },
  );

  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Comma");

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => {
    document
      .querySelector<HTMLElement>('[data-settings-shortcut="nav-booking"]')
      ?.click();
  });
  await expect(
    settingsDialog.getByRole("button", { name: "Save booking settings" }),
  ).toBeVisible({ timeout: 15000 });

  return captured;
}

/** Dispatches a DOM click for OverlayPanel buttons that re-render during Playwright clicks. */
export const dispatchClick = async (
  locator: import("@playwright/test").Locator,
) => {
  await locator.waitFor({ state: "attached", timeout: 10000 });
  await locator.evaluate((el) => {
    (el as HTMLElement).click();
  });
};

/**
 * Sets an input's value through the prototype setter and dispatches `input`,
 * for the same OverlayPanel re-render quirk dispatchClick works around:
 * Playwright's fill leaves controlled inputs in this dialog unchanged.
 */
export const dispatchFill = async (
  locator: import("@playwright/test").Locator,
  value: string,
) => {
  await locator.waitFor({ state: "attached", timeout: 10000 });
  await locator.evaluate((el, nextValue) => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, nextValue);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
};

export function formatSlotButtonLabel(
  slotStart: string,
  timeZone = "UTC",
): RegExp {
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(slotStart));
  const escaped = time.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

export function formatSlotWhenLabel(
  slotStart: string,
  timeZone = "UTC",
): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(slotStart));
}

export function formatMonthDayButtonLabel(
  slotStart: string,
  timeZone = "UTC",
): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(slotStart));
}
