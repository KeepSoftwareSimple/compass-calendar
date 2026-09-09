import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { Status } from "@core/errors/status.codes";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import {
  formatBookingDateKey,
  formatBookingMonthDayLabel,
  formatBookingMonthHeading,
  formatBookingMonthKey,
  formatBookingSlotLabel,
  formatBookingSlotTime,
  shiftBookingMonthKey,
} from "@web/booking/public-booking.format";
import { releasePublicBookingPageHeadingFocus } from "@web/booking/use-booking-heading-focus";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { routeTree } from "@web/routers/router.routes";
import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";

const mockTrack = mock();
const actualTrack = { ...(await import("@web/auth/posthog/track")) };
let isTrackMocked = true;
mock.module("@web/auth/posthog/track", () => ({
  ...actualTrack,
  track: (...args: Parameters<typeof actualTrack.track>) =>
    isTrackMocked ? mockTrack(...args) : actualTrack.track(...args),
}));

afterAll(() => {
  isTrackMocked = false;
});

afterEach(() => {
  releasePublicBookingPageHeadingFocus();
  mockTrack.mockClear();
});

function renderBookingRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMs: 0,
  });
  const { wrapper } = createStoreWrapper();
  const result = render(
    <HotkeysProvider>
      <RouterProvider router={router} />
    </HotkeysProvider>,
    { wrapper },
  );
  return { ...result, router };
}

function monthKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function slotAround(start: Date) {
  return {
    slotStart: start.toISOString(),
    slotEnd: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
  };
}

/** Distinct sibling on the same UTC date, stepping backward when +gap would leave the day. */
function slotOnSameUtcDay(
  current: { slotStart: string; slotEnd: string },
  gapMinutes: number,
) {
  const currentMs = Date.parse(current.slotStart);
  const day = current.slotStart.slice(0, 10);
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  const lastStart = Date.parse(`${day}T23:59:00.000Z`);
  const after = currentMs + gapMinutes * 60 * 1000;
  if (after <= lastStart && after !== currentMs) {
    return slotAround(new Date(after));
  }
  const before = currentMs - gapMinutes * 60 * 1000;
  if (before >= dayStart && before !== currentMs) {
    return slotAround(new Date(before));
  }
  return slotAround(new Date(dayStart));
}

function utcTodayAt(now: Date, hours: number, minutes: number) {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hours,
      minutes,
      0,
      0,
    ),
  );
}

/**
 * Future slot in the current UTC month. Prefers 12:00 UTC so the calendar
 * date matches Europe/Berlin. After noon, stay on today instead of +2h,
 * which becomes 12:00 AM the next Berlin day on month-end evenings.
 */
function bookableSlotInCurrentMonth(minuteOffset = 0) {
  const now = new Date();
  const berlinMonthNow = monthKeyInZone(now, "Europe/Berlin");
  const noon = utcTodayAt(now, 12, minuteOffset);
  if (
    noon.getTime() > now.getTime() &&
    noon.getUTCMonth() === now.getUTCMonth()
  ) {
    return slotAround(noon);
  }

  const evening = utcTodayAt(now, 20, minuteOffset);
  if (
    evening.getTime() > now.getTime() &&
    monthKeyInZone(evening, "Europe/Berlin") === berlinMonthNow
  ) {
    return slotAround(evening);
  }

  const soon = new Date(now.getTime() + (20 + minuteOffset) * 60 * 1000);
  soon.setUTCSeconds(0, 0);
  soon.setUTCMilliseconds(0);
  if (soon.getUTCMonth() === now.getUTCMonth()) {
    if (monthKeyInZone(soon, "Europe/Berlin") === berlinMonthNow) {
      return slotAround(soon);
    }
    const stillThisBerlinMonth = berlinMonthNow === monthKeyInZone(now, "UTC");
    if (stillThisBerlinMonth) {
      const beforeBerlinMidnight = new Date(now.getTime() + 60 * 1000);
      beforeBerlinMidnight.setUTCSeconds(0, 0);
      if (
        monthKeyInZone(beforeBerlinMidnight, "Europe/Berlin") ===
          berlinMonthNow &&
        beforeBerlinMidnight.getUTCMonth() === now.getUTCMonth()
      ) {
        return slotAround(beforeBerlinMidnight);
      }
    }
    return slotAround(soon);
  }

  const late = utcTodayAt(now, 23, 59);
  if (late.getTime() > now.getTime()) {
    return slotAround(late);
  }

  return slotAround(soon);
}

function bookableSlotOnSecondOfUtcMonth(year: number, monthIndex: number) {
  return slotAround(new Date(Date.UTC(year, monthIndex, 2, 16, 0, 0)));
}

function bookableSlotInNextMonth() {
  const now = new Date();
  return bookableSlotOnSecondOfUtcMonth(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
  );
}

/** Day 2 of the month after `now` in `timeZone`, at 16:00 UTC. */
function bookableSlotAfterCurrentMonthInZone(timeZone: string) {
  const [year, month] = monthKeyInZone(new Date(), timeZone)
    .split("-")
    .map(Number);
  return bookableSlotOnSecondOfUtcMonth(year, month);
}

function slotButtonName(iso: string, timeZone = "UTC") {
  return formatBookingSlotTime(iso, timeZone);
}

async function selectGuestTimeZone(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
) {
  await user.click(screen.getByRole("button", { name: /^Timezone:/ }));
  await user.type(screen.getByRole("combobox"), query);
  await user.keyboard("{Enter}");
}

const currentSlot = bookableSlotInCurrentMonth();
const laterCurrentSlot = (() => {
  const later = bookableSlotInCurrentMonth(30);
  if (
    later.slotStart !== currentSlot.slotStart &&
    later.slotStart.slice(0, 10) === currentSlot.slotStart.slice(0, 10)
  ) {
    return later;
  }
  return slotOnSameUtcDay(currentSlot, 15);
})();
const nextMonthSlot = bookableSlotInNextMonth();
const guestTimeZone = "UTC";
const currentMonthKey = new Date().toISOString().slice(0, 7);

const publicPagePayload = (overrides: Record<string, unknown> = {}) => ({
  hostDisplayName: "Tyler Dane",
  durationMinutes: 30,
  timeZone: "America/Chicago",
  enabled: true,
  maxHorizonDays: 60,
  ...overrides,
});

function pageHandler() {
  return rest.get(
    `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane`,
    (_req, res, ctx) =>
      res(ctx.status(Status.OK), ctx.json(publicPagePayload())),
  );
}

function slotsInWindow(
  allSlots: Array<{ slotStart: string; slotEnd: string }>,
  onRequest?: () => void,
) {
  return rest.get(
    `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
    (req, res, ctx) => {
      onRequest?.();
      const start = req.url.searchParams.get("start");
      const end = req.url.searchParams.get("end");
      const startMs = start ? Date.parse(start) : Number.NEGATIVE_INFINITY;
      const endMs = end ? Date.parse(end) : Number.POSITIVE_INFINITY;
      const slots = allSlots.filter((slot) => {
        const at = Date.parse(slot.slotStart);
        return at >= startMs && at < endMs;
      });
      return res(ctx.status(Status.OK), ctx.json({ bookable: true, slots }));
    },
  );
}

function reservationGetHandler(
  overrides: Record<string, unknown> = {},
  id = "000000000000000000000099",
) {
  return rest.get(
    `${ENV_WEB.API_BASEURL}/booking/reservations/${id}`,
    (_req, res, ctx) =>
      res(
        ctx.status(Status.OK),
        ctx.json({
          slotStart: currentSlot.slotStart,
          guestTimeZone: "UTC",
          durationMinutes: 30,
          hostDisplayName: "Tyler Dane",
          status: "confirmed",
          bookingSlug: "tylerdane",
          guestName: "Guest User",
          notes: null,
          ...overrides,
        }),
      ),
  );
}

describe("slotOnSameUtcDay", () => {
  it("steps forward when the gap still fits on the UTC day", () => {
    const current = slotAround(new Date("2026-08-31T20:00:00.000Z"));
    expect(slotOnSameUtcDay(current, 30).slotStart).toBe(
      "2026-08-31T20:30:00.000Z",
    );
  });

  it("steps backward instead of collapsing onto 23:59 at month-end midnight", () => {
    const current = slotAround(new Date("2026-08-31T23:59:00.000Z"));
    const sibling = slotOnSameUtcDay(current, 15);
    expect(sibling.slotStart).toBe("2026-08-31T23:44:00.000Z");
    expect(sibling.slotStart).not.toBe(current.slotStart);
  });
});

describe("PublicBookingPage", () => {
  it("uses two distinct same-day slots in the current UTC month", () => {
    expect(laterCurrentSlot.slotStart).not.toBe(currentSlot.slotStart);
    expect(laterCurrentSlot.slotStart.slice(0, 10)).toBe(
      currentSlot.slotStart.slice(0, 10),
    );
  });

  it("shows a generic not-found state for an unknown slug", async () => {
    renderBookingRoute("/meet/unknown-host");

    expect(
      await screen.findByRole("heading", { name: "Meeting page not found" }),
    ).toHaveFocus();
    expect(
      screen.getByText(
        /may be incorrect or the host has turned this meeting page off/,
      ),
    ).toBeInTheDocument();
    expect(mockTrack).not.toHaveBeenCalledWith(
      "booking_page_viewed",
      expect.anything(),
    );
  });

  it("fires booking_page_viewed once for an enabled page", async () => {
    server.use(pageHandler(), slotsInWindow([currentSlot]));
    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith("booking_page_viewed", {
      duration_minutes: 30,
    });
  });

  it("does not fire booking_page_viewed for a disabled page", async () => {
    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane`,
        (_req, res, ctx) =>
          res(
            ctx.status(Status.OK),
            ctx.json(publicPagePayload({ enabled: false })),
          ),
      ),
    );
    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Meeting page not found" }),
    ).toBeInTheDocument();
    expect(mockTrack).not.toHaveBeenCalledWith(
      "booking_page_viewed",
      expect.anything(),
    );
  });

  it("skips the month grid to the slot list", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([currentSlot]));
    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Skip to open times" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Pick a time" })).toHaveFocus();

    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Your details" }),
    ).toHaveFocus();
    (document.activeElement as HTMLElement | null)?.blur();
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Skip to your details" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Your details" })).toHaveFocus();
  });

  it("does not render welcome text on the public page", async () => {
    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane`,
        (_req, res, ctx) =>
          res(ctx.status(Status.OK), ctx.json(publicPagePayload())),
      ),
      slotsInWindow([currentSlot]),
    );

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(screen.getByText("30 minutes Google Meet")).toBeInTheDocument();
    expect(
      screen.queryByText("30 minutes to talk through Compass Calendar."),
    ).not.toBeInTheDocument();
  });

  it("names Teams on the duration line when the destination conference is teams", async () => {
    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane`,
        (_req, res, ctx) =>
          res(
            ctx.status(Status.OK),
            ctx.json(publicPagePayload({ conference: "teams" })),
          ),
      ),
      slotsInWindow([currentSlot]),
    );

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(screen.getByText("30 minutes Microsoft Teams")).toBeInTheDocument();
    expect(screen.queryByText(/Google Meet/)).not.toBeInTheDocument();
  });

  it("omits a conference name when the destination conference is none", async () => {
    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane`,
        (_req, res, ctx) =>
          res(
            ctx.status(Status.OK),
            ctx.json(publicPagePayload({ conference: "none" })),
          ),
      ),
      slotsInWindow([currentSlot]),
    );

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
    expect(screen.queryByText(/Google Meet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Microsoft Teams/)).not.toBeInTheDocument();
  });

  it("labels times in the guest timezone and confirms a booking", async () => {
    const user = userEvent.setup({ delay: null });
    let postedBody: unknown;

    server.use(
      pageHandler(),
      slotsInWindow([currentSlot]),
      reservationGetHandler(),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/reservations`,
        async (req, res, ctx) => {
          postedBody = await req.json();
          return res(
            ctx.status(Status.OK),
            ctx.json({
              reservationId: "000000000000000000000099",
              slotStart: currentSlot.slotStart,
              slotEnd: currentSlot.slotEnd,
              guestTimeZone: "UTC",
              cancelUrl:
                "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
              rescheduleUrl:
                "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
            }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(screen.getByText("30 minutes Google Meet")).toBeInTheDocument();
    expect(screen.getByRole("main").parentElement).toHaveAttribute(
      "data-document-scroll",
    );
    expect(screen.getByRole("main").className).toContain("max-w-3xl");
    expect(
      await screen.findByText(/Times shown in your timezone/),
    ).toBeInTheDocument();

    const dateKey = formatBookingDateKey(currentSlot.slotStart, guestTimeZone);
    expect(
      await screen.findByRole("button", {
        name: formatBookingMonthDayLabel(dateKey, guestTimeZone),
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    const detailsHeading = screen.getByRole("heading", {
      name: "Your details",
    });
    await waitFor(() => {
      expect(detailsHeading).toHaveFocus();
    });
    expect(screen.getByText("When")).toBeInTheDocument();
    expect(
      screen.getByText(
        formatBookingSlotLabel(currentSlot.slotStart, guestTimeZone),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Timezone")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pick a time" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Guest User");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.click(screen.getByRole("button", { name: "Confirm meeting" }));

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toHaveFocus();
    expect(postedBody).toMatchObject({
      slotStart: currentSlot.slotStart,
      guestName: "Guest User",
      guestEmail: "guest@example.com",
      guestTimeZone: "UTC",
      durationMinutes: 30,
    });
    expect(
      screen.queryByRole("button", { name: /^Copy / }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Cancel this meeting" }),
    ).toBeInTheDocument();
    expect(mockTrack).toHaveBeenCalledWith("booking_reservation_created", {
      duration_minutes: 30,
    });
    const reservationEvents = mockTrack.mock.calls.filter(
      (call) => call[0] === "booking_reservation_created",
    );
    expect(reservationEvents).toEqual([
      ["booking_reservation_created", { duration_minutes: 30 }],
    ]);
    expect(
      screen.getByRole("link", { name: "Reschedule this meeting" }),
    ).toBeInTheDocument();
  });

  it("overrides the guest timezone for labels, day grouping, and submit", async () => {
    const user = userEvent.setup({ delay: null });
    let postedBody: unknown;
    const slotTimeZones: string[] = [];
    const overrideZone = "Asia/Tokyo";
    const slot = nextMonthSlot;

    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tzhost`,
        (_req, res, ctx) =>
          res(ctx.status(Status.OK), ctx.json(publicPagePayload())),
      ),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tzhost/slots`,
        (req, res, ctx) => {
          slotTimeZones.push(req.url.searchParams.get("timeZone") ?? "");
          const start = req.url.searchParams.get("start");
          const end = req.url.searchParams.get("end");
          const startMs = start ? Date.parse(start) : Number.NEGATIVE_INFINITY;
          const endMs = end ? Date.parse(end) : Number.POSITIVE_INFINITY;
          const slots = [slot].filter((item) => {
            const at = Date.parse(item.slotStart);
            return at >= startMs && at < endMs;
          });
          return res(
            ctx.status(Status.OK),
            ctx.json({ bookable: true, slots }),
          );
        },
      ),
      reservationGetHandler({
        slotStart: slot.slotStart,
        guestTimeZone: overrideZone,
      }),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/pages/tzhost/reservations`,
        async (req, res, ctx) => {
          postedBody = await req.json();
          return res(
            ctx.status(Status.OK),
            ctx.json({
              reservationId: "000000000000000000000099",
              slotStart: slot.slotStart,
              slotEnd: slot.slotEnd,
              guestTimeZone: overrideZone,
              cancelUrl:
                "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
              rescheduleUrl:
                "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
            }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tzhost");

    expect(
      await screen.findByText(/Times shown in your timezone/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Timezone: UTC/ }),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Next month" }));

    const utcDateKey = formatBookingDateKey(slot.slotStart, guestTimeZone);
    expect(
      await screen.findByRole("button", {
        name: formatBookingMonthDayLabel(utcDateKey, guestTimeZone),
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await screen.findByRole("button", {
        name: slotButtonName(slot.slotStart, guestTimeZone),
      }),
    ).toBeInTheDocument();

    await selectGuestTimeZone(user, "tokyo");

    expect(
      await screen.findByRole("button", { name: /^Timezone: Tokyo/ }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(slotTimeZones).toContain(overrideZone);
    });

    const tokyoDateKey = formatBookingDateKey(slot.slotStart, overrideZone);
    expect(tokyoDateKey).not.toBe(utcDateKey);
    expect(
      await screen.findByRole("button", {
        name: formatBookingMonthDayLabel(tokyoDateKey, overrideZone),
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await screen.findByRole("button", {
        name: slotButtonName(slot.slotStart, overrideZone),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: slotButtonName(slot.slotStart, guestTimeZone),
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: slotButtonName(slot.slotStart, overrideZone),
      }),
    );
    expect(
      screen.getByText(formatBookingSlotLabel(slot.slotStart, overrideZone)),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Guest User");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.click(screen.getByRole("button", { name: "Confirm meeting" }));

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toBeInTheDocument();
    expect(postedBody).toMatchObject({
      slotStart: slot.slotStart,
      guestTimeZone: overrideZone,
    });
  });

  it("keeps the guest timezone across month navigation and the details step", async () => {
    const user = userEvent.setup({ delay: null });
    const overrideZone = "Europe/Berlin";
    const persistNextSlot = bookableSlotAfterCurrentMonthInZone(overrideZone);

    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tzpersist`,
        (_req, res, ctx) =>
          res(ctx.status(Status.OK), ctx.json(publicPagePayload())),
      ),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tzpersist/slots`,
        (req, res, ctx) => {
          const start = req.url.searchParams.get("start");
          const end = req.url.searchParams.get("end");
          const startMs = start ? Date.parse(start) : Number.NEGATIVE_INFINITY;
          const endMs = end ? Date.parse(end) : Number.POSITIVE_INFINITY;
          const slots = [currentSlot, persistNextSlot].filter((slot) => {
            const at = Date.parse(slot.slotStart);
            return at >= startMs && at < endMs;
          });
          return res(
            ctx.status(Status.OK),
            ctx.json({ bookable: true, slots }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tzpersist");

    await screen.findByRole("button", {
      name: slotButtonName(currentSlot.slotStart, guestTimeZone),
    });
    await selectGuestTimeZone(user, "berlin");
    expect(
      await screen.findByRole("button", { name: /^Timezone: Berlin/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart, overrideZone),
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next month" }));
    const nextMonthKey = shiftBookingMonthKey(
      formatBookingMonthKey(new Date(), overrideZone),
      1,
      overrideZone,
    );
    expect(
      await screen.findByRole("heading", {
        name: formatBookingMonthHeading(nextMonthKey, overrideZone),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Timezone: Berlin/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: slotButtonName(persistNextSlot.slotStart, overrideZone),
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart, overrideZone),
      }),
    );
    expect(
      screen.getByRole("button", { name: /^Timezone: Berlin/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        formatBookingSlotLabel(currentSlot.slotStart, overrideZone),
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change time" }));
    expect(
      await screen.findByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Timezone: Berlin/ }),
    ).toBeInTheDocument();
  });

  it("shows unavailable when bookable is false", async () => {
    server.use(
      pageHandler(),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
        (_req, res, ctx) =>
          res(ctx.status(Status.OK), ctx.json({ slots: [], bookable: false })),
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", {
        name: "Meeting temporarily unavailable",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/week/i)).not.toBeInTheDocument();
  });

  it("keeps guest details and moves focus to the alert on 409", async () => {
    const user = userEvent.setup({ delay: null });
    let slotRequests = 0;

    server.use(
      pageHandler(),
      slotsInWindow([currentSlot, laterCurrentSlot], () => {
        slotRequests += 1;
      }),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/reservations`,
        (_req, res, ctx) => res(ctx.status(Status.CONFLICT), ctx.json({})),
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    await screen.findByRole("heading", { name: "Meet with Tyler Dane" });
    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    await user.type(screen.getByLabelText("Name"), "Guest User");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.type(screen.getByLabelText("Notes (optional)"), "Bring slides");
    await user.click(screen.getByRole("button", { name: "Confirm meeting" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "This time is no longer available. Pick another slot.",
    );
    await waitFor(() => {
      expect(alert).toHaveFocus();
    });
    expect(screen.getByLabelText("Name")).toHaveValue("Guest User");
    expect(screen.getByLabelText("Email")).toHaveValue("guest@example.com");
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue(
      "Bring slides",
    );
    expect(
      screen.getByRole("button", { name: "Confirm meeting" }),
    ).toBeDisabled();
    await waitFor(() => {
      expect(slotRequests).toBeGreaterThan(1);
    });
    expect(
      screen.getByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: slotButtonName(laterCurrentSlot.slotStart),
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Your details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm meeting" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Name")).toHaveValue("Guest User");
  });

  it("does not boot the calendar shortcut overlay on public booking routes", async () => {
    server.use(
      pageHandler(),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
        (_req, res, ctx) =>
          res(ctx.status(Status.OK), ctx.json({ slots: [], bookable: true })),
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    await screen.findByRole("heading", { name: "Meet with Tyler Dane" });
    expect(screen.queryByText(/Keyboard shortcuts/i)).not.toBeInTheDocument();
  });

  it("starts page meta and the current-month slots request in parallel", async () => {
    const events: string[] = [];
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane`,
        async (_req, res, ctx) => {
          events.push("page-start");
          await delay(80);
          events.push("page-end");
          return res(ctx.status(Status.OK), ctx.json(publicPagePayload()));
        },
      ),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
        async (_req, res, ctx) => {
          events.push("slots-start");
          await delay(80);
          events.push("slots-end");
          return res(
            ctx.status(Status.OK),
            ctx.json({
              bookable: true,
              slots: [currentSlot],
            }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    await waitFor(() => {
      expect(events).toContain("page-start");
      expect(events).toContain("slots-start");
    });
    expect(events).not.toContain("page-end");
    expect(events).not.toContain("slots-end");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
  });

  it("renders a prefetched month without a new slots request", async () => {
    const user = userEvent.setup({ delay: null });
    let slotRequests = 0;

    server.use(
      pageHandler(),
      slotsInWindow([currentSlot, nextMonthSlot], () => {
        slotRequests += 1;
      }),
    );

    renderBookingRoute("/meet/tylerdane");

    await screen.findByRole("heading", { name: "Meet with Tyler Dane" });
    expect(
      await screen.findByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(slotRequests).toBeGreaterThanOrEqual(2);
    });
    const requestsAfterPrefetch = slotRequests;

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(
      screen.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(slotRequests).toBeGreaterThanOrEqual(requestsAfterPrefetch);
    });
    const requestsAfterArrive = slotRequests;

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(slotRequests).toBe(requestsAfterArrive);
  });

  it("clamps the slot request to the host horizon and still loads times", async () => {
    let slotStartParam: string | null = null;
    let slotEndParam: string | null = null;
    const inWindowStart = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const inWindowEnd = new Date(
      Date.parse(inWindowStart) + 30 * 60 * 1000,
    ).toISOString();

    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane`,
        (_req, res, ctx) =>
          res(
            ctx.status(Status.OK),
            ctx.json(publicPagePayload({ maxHorizonDays: 7 })),
          ),
      ),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
        (req, res, ctx) => {
          if (slotStartParam == null) {
            slotStartParam = req.url.searchParams.get("start");
            slotEndParam = req.url.searchParams.get("end");
          }
          return res(
            ctx.status(Status.OK),
            ctx.json({
              bookable: true,
              slots: [{ slotStart: inWindowStart, slotEnd: inWindowEnd }],
            }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Could not load times" }),
    ).not.toBeInTheDocument();
    expect(slotStartParam).toBeTruthy();
    expect(slotEndParam).toBeTruthy();
    const requestedMs =
      Date.parse(slotEndParam ?? "") - Date.parse(slotStartParam ?? "");
    expect(requestedMs).toBeGreaterThan(0);
    expect(requestedMs).toBeLessThanOrEqual(32 * 24 * 60 * 60 * 1000);
    const start = new Date(slotStartParam ?? "");
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
    expect(start.getUTCMilliseconds()).toBe(0);
  });

  it("scopes the slot list to the selected day and swaps it when the month changes", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([currentSlot, nextMonthSlot]));

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: slotButtonName(nextMonthSlot.slotStart),
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next month" }));

    const nextMonthKey = shiftBookingMonthKey(
      currentMonthKey,
      1,
      guestTimeZone,
    );
    expect(
      await screen.findByRole("heading", {
        name: formatBookingMonthHeading(nextMonthKey, guestTimeZone),
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: slotButtonName(nextMonthSlot.slotStart),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    ).not.toBeInTheDocument();
  });

  it("jumps across a month boundary to the next open day", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([nextMonthSlot]));

    renderBookingRoute("/meet/tylerdane");

    await screen.findByRole("heading", { name: "Meet with Tyler Dane" });
    expect(
      await screen.findByText("No open times this month."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Jump to next available day" }),
    );

    const nextMonthKey = shiftBookingMonthKey(
      currentMonthKey,
      1,
      guestTimeZone,
    );
    expect(
      await screen.findByRole("heading", {
        name: formatBookingMonthHeading(nextMonthKey, guestTimeZone),
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: slotButtonName(nextMonthSlot.slotStart),
      }),
    ).toBeInTheDocument();
    const nextDateKey = formatBookingDateKey(
      nextMonthSlot.slotStart,
      guestTimeZone,
    );
    expect(
      screen.getByRole("button", {
        name: formatBookingMonthDayLabel(nextDateKey, guestTimeZone),
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("does not open Your details when jump finds no times in the horizon", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([]));

    renderBookingRoute("/meet/tylerdane");

    await screen.findByRole("heading", { name: "Meet with Tyler Dane" });
    expect(
      await screen.findByText("No open times this month."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Jump to next available day" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No open times in the next 60 days. Check back later.",
    );
    await waitFor(() => {
      expect(alert).toHaveFocus();
    });
    expect(
      screen.getByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Your details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm meeting" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Select a time to continue.")).toBeInTheDocument();
  });

  it("returns to the picker with the day and typed fields intact", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([currentSlot, laterCurrentSlot]));

    renderBookingRoute("/meet/tylerdane");

    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    await user.type(screen.getByLabelText("Name"), "Guest User");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.type(screen.getByLabelText("Notes (optional)"), "Bring slides");
    await user.click(screen.getByRole("button", { name: "Change time" }));

    const pickerHeading = await screen.findByRole("heading", {
      name: "Pick a time",
    });
    await waitFor(() => {
      expect(pickerHeading).toHaveFocus();
    });
    const dateKey = formatBookingDateKey(currentSlot.slotStart, guestTimeZone);
    expect(
      screen.getByRole("button", {
        name: formatBookingMonthDayLabel(dateKey, guestTimeZone),
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: slotButtonName(laterCurrentSlot.slotStart),
      }),
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Guest User");
    expect(screen.getByLabelText("Email")).toHaveValue("guest@example.com");
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue(
      "Bring slides",
    );
    expect(
      screen.getByText(
        formatBookingSlotLabel(laterCurrentSlot.slotStart, guestTimeZone),
      ),
    ).toBeInTheDocument();
  });

  it("shows an in-flight confirm label and posts only once", async () => {
    const user = userEvent.setup({ delay: null });
    let posts = 0;
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    server.use(
      pageHandler(),
      slotsInWindow([currentSlot]),
      reservationGetHandler(),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/reservations`,
        async (_req, res, ctx) => {
          posts += 1;
          await delay(80);
          return res(
            ctx.status(Status.OK),
            ctx.json({
              reservationId: "000000000000000000000099",
              slotStart: currentSlot.slotStart,
              slotEnd: currentSlot.slotEnd,
              guestTimeZone: "UTC",
              cancelUrl:
                "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
              rescheduleUrl:
                "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
            }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    await user.type(screen.getByLabelText("Name"), "Guest User");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    const confirm = screen.getByRole("button", { name: "Confirm meeting" });
    await user.click(confirm);
    const confirming = await screen.findByRole("button", {
      name: "Confirming...",
    });
    expect(confirming).toHaveAttribute("aria-busy", "true");
    expect(confirming).toBeDisabled();
    fireEvent.submit(confirming.closest("form") as HTMLFormElement);
    expect(posts).toBe(1);

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toBeInTheDocument();
    expect(posts).toBe(1);
  });

  it("keeps the host heading visible and announces slot loading", async () => {
    let releaseSlots = () => {};
    const slotsGate = new Promise<void>((resolve) => {
      releaseSlots = resolve;
    });

    server.use(
      pageHandler(),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
        async (_req, res, ctx) => {
          await slotsGate;
          return res(
            ctx.status(Status.OK),
            ctx.json({ bookable: true, slots: [currentSlot] }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Loading open times",
      );
    });
    expect(
      screen.queryByRole("heading", { name: "Pick a time" }),
    ).not.toBeInTheDocument();
    releaseSlots();
    expect(
      await screen.findByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Times loaded");
    expect(
      screen.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
  });

  it("retries a failed slots request without leaving the page", async () => {
    const user = userEvent.setup({ delay: null });
    const slotFailGate = { fail: true };

    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/retryhost`,
        (_req, res, ctx) =>
          res(ctx.status(Status.OK), ctx.json(publicPagePayload())),
      ),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/retryhost/slots`,
        (_req, res, ctx) => {
          if (slotFailGate.fail) {
            return res(ctx.status(Status.INTERNAL_SERVER), ctx.json({}));
          }
          return res(
            ctx.status(Status.OK),
            ctx.json({ bookable: true, slots: [currentSlot] }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/retryhost");

    expect(
      await screen.findByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Could not load times",
    );
    slotFailGate.fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    const pickTime = await screen.findByRole("heading", {
      name: "Pick a time",
    });
    await waitFor(() => {
      expect(pickTime).toHaveFocus();
    });
    expect(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
  });

  it("shows a slot-pane skeleton on an unfetched month without replacing the header", async () => {
    const user = userEvent.setup({ delay: null });
    let releaseNextMonthSlots = () => {};
    const nextMonthSlotsGate = new Promise<void>((resolve) => {
      releaseNextMonthSlots = resolve;
    });
    let currentMonthRequests = 0;

    server.use(
      pageHandler(),
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
        async (req, res, ctx) => {
          const start = req.url.searchParams.get("start") ?? "";
          const isCurrentMonth = start.startsWith(`${currentMonthKey}-`);
          if (isCurrentMonth) {
            currentMonthRequests += 1;
            return res(
              ctx.status(Status.OK),
              ctx.json({ bookable: true, slots: [currentSlot] }),
            );
          }
          await nextMonthSlotsGate;
          return res(
            ctx.status(Status.OK),
            ctx.json({ bookable: true, slots: [nextMonthSlot] }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    expect(
      await screen.findByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(currentMonthRequests).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(
      screen.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: formatBookingMonthHeading(
          shiftBookingMonthKey(currentMonthKey, 1, guestTimeZone),
          guestTimeZone,
        ),
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Loading open times",
      );
    });
    expect(
      screen.queryByRole("heading", { name: "Pick a time" }),
    ).not.toBeInTheDocument();
    releaseNextMonthSlots();
    expect(
      await screen.findByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
  });

  it("returns to the picker on Escape from Your details", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([currentSlot]));
    renderBookingRoute("/meet/tylerdane");

    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    await screen.findByRole("heading", { name: "Your details" });
    await user.type(screen.getByLabelText("Name"), "Guest User");
    await user.keyboard("{Escape}");

    const pickerHeading = await screen.findByRole("heading", {
      name: "Pick a time",
    });
    await waitFor(() => {
      expect(pickerHeading).toHaveFocus();
    });
    expect(
      screen.queryByRole("heading", { name: "Your details" }),
    ).not.toBeInTheDocument();
  });

  it("moves focus from a slot to the selected day on Escape", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([currentSlot]));
    renderBookingRoute("/meet/tylerdane");

    await screen.findByRole("heading", { name: "Pick a time" });
    const dateKey = formatBookingDateKey(currentSlot.slotStart, guestTimeZone);
    const day = await screen.findByRole("button", {
      name: formatBookingMonthDayLabel(dateKey, guestTimeZone),
    });
    const slot = await screen.findByRole("button", {
      name: slotButtonName(currentSlot.slotStart),
    });
    slot.focus();
    await user.keyboard("{Escape}");
    expect(day).toHaveFocus();
    expect(
      screen.getByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
  });

  it("closes the timezone panel on Escape without leaving Your details", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([currentSlot]));
    renderBookingRoute("/meet/tylerdane");

    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    await screen.findByRole("heading", { name: "Your details" });
    await user.click(screen.getByRole("button", { name: /^Timezone:/ }));
    expect(
      await screen.findByRole("heading", { name: "Timezone" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Timezone" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Your details" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pick a time" }),
    ).not.toBeInTheDocument();
  });

  it("does not navigate away when Escape is pressed on the month grid", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(pageHandler(), slotsInWindow([currentSlot]));
    const { router } = renderBookingRoute("/meet/tylerdane");

    await screen.findByRole("heading", { name: "Pick a time" });
    const dateKey = formatBookingDateKey(currentSlot.slotStart, guestTimeZone);
    const day = await screen.findByRole("button", {
      name: formatBookingMonthDayLabel(dateKey, guestTimeZone),
    });
    day.focus();
    const href = router.state.location.href;
    await user.keyboard("{Escape}");

    expect(day).toHaveFocus();
    expect(router.state.location.href).toBe(href);
    expect(
      screen.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
  });
});

describe("PublicBookingConfirmedPage", () => {
  it("shows booking details from the public GET", async () => {
    server.use(reservationGetHandler());
    renderBookingRoute("/meet/confirmed/000000000000000000000099");

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toHaveFocus();
    expect(
      screen.queryByText(/30 minutes Google Meet/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("When")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Timezone")).toBeInTheDocument();
    expect(
      screen.getByText("A Google Meet invite is on its way to your email."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/To cancel, use the link in that invite/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Guest User")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Copy / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
  });

  it("offers cancel and edit on a cold permalink with a token", async () => {
    server.use(reservationGetHandler());
    renderBookingRoute("/meet/confirmed/000000000000000000000099?token=abc");

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Copy / }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Cancel this meeting" }),
    ).toHaveAttribute(
      "href",
      `${window.location.origin}/meet/cancel/000000000000000000000099?token=abc`,
    );
    expect(
      screen.getByRole("link", { name: "Reschedule this meeting" }),
    ).toHaveAttribute(
      "href",
      `${window.location.origin}/meet/reschedule/000000000000000000000099?token=abc`,
    );
    expect(
      screen.getByText("A Google Meet invite is on its way to your email."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/To cancel, use the link in that invite/),
    ).not.toBeInTheDocument();
  });

  it("promises a calendar invite when the reservation cannot mint Meet", async () => {
    server.use(reservationGetHandler({ createsGoogleMeet: false }));
    renderBookingRoute("/meet/confirmed/000000000000000000000099");

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The calendar invite is on its way to your email."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/To cancel, use the link in that invite/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/A Google Meet invite is on its way to your email/),
    ).not.toBeInTheDocument();
  });

  it("returns to the host booking page on Escape and focuses its heading", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      pageHandler(),
      slotsInWindow([currentSlot]),
      reservationGetHandler(),
    );
    const { router } = renderBookingRoute(
      "/meet/confirmed/000000000000000000000099",
    );

    await screen.findByRole("heading", {
      name: "You're meeting with Tyler Dane",
    });
    await user.keyboard("{Escape}");

    const heading = await screen.findByRole("heading", {
      name: "Meet with Tyler Dane",
    });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(router.state.location.pathname).toBe("/meet/tylerdane");
  });

  it("does not navigate on Escape when the confirmation has no slug", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(reservationGetHandler({ status: "cancelled" }));
    const { router } = renderBookingRoute(
      "/meet/confirmed/000000000000000000000099",
    );

    const heading = await screen.findByRole("heading", {
      name: "This meeting was canceled",
    });
    await user.keyboard("{Escape}");

    expect(heading).toHaveFocus();
    expect(router.state.location.pathname).toBe(
      "/meet/confirmed/000000000000000000000099",
    );
  });

  it("does not navigate on Escape when the reservation is unknown", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/reservations/000000000000000000000099`,
        (_req, res, ctx) => res(ctx.status(Status.NOT_FOUND), ctx.json({})),
      ),
    );
    const { router } = renderBookingRoute(
      "/meet/confirmed/000000000000000000000099",
    );

    const heading = await screen.findByRole("heading", {
      name: "Meeting not found",
    });
    await user.keyboard("{Escape}");

    expect(heading).toHaveFocus();
    expect(router.state.location.pathname).toBe(
      "/meet/confirmed/000000000000000000000099",
    );
  });

  it("shows a calm state for a cancelled reservation", async () => {
    server.use(reservationGetHandler({ status: "cancelled" }));
    renderBookingRoute("/meet/confirmed/000000000000000000000099");

    expect(
      await screen.findByRole("heading", {
        name: "This meeting was canceled",
      }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: /^Copy / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Reschedule this meeting" }),
    ).not.toBeInTheDocument();
  });

  it("shows a calm state for an unknown reservation", async () => {
    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/reservations/000000000000000000000099`,
        (_req, res, ctx) => res(ctx.status(Status.NOT_FOUND), ctx.json({})),
      ),
    );
    renderBookingRoute("/meet/confirmed/000000000000000000000099");

    expect(
      await screen.findByRole("heading", { name: "Meeting not found" }),
    ).toHaveFocus();
  });

  it("shows a retryable state when the public GET fails", async () => {
    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/reservations/000000000000000000000099`,
        (_req, res, ctx) =>
          res(ctx.status(Status.INTERNAL_SERVER), ctx.json({})),
      ),
    );
    renderBookingRoute("/meet/confirmed/000000000000000000000099");

    expect(
      await screen.findByRole("heading", { name: "Could not load meeting" }),
    ).toHaveFocus();
  });

  it("shows cancel and reschedule links from confirmation history state", async () => {
    const user = userEvent.setup({ delay: null });

    server.use(
      pageHandler(),
      slotsInWindow([currentSlot]),
      reservationGetHandler(),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/reservations`,
        async (_req, res, ctx) =>
          res(
            ctx.status(Status.OK),
            ctx.json({
              reservationId: "000000000000000000000099",
              slotStart: currentSlot.slotStart,
              slotEnd: currentSlot.slotEnd,
              guestTimeZone: "UTC",
              cancelUrl:
                "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
              rescheduleUrl:
                "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
            }),
          ),
      ),
    );

    renderBookingRoute("/meet/tylerdane");
    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    await user.type(screen.getByLabelText("Name"), "Guest User");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.click(screen.getByRole("button", { name: "Confirm meeting" }));
    expect(
      await screen.findByRole("link", { name: "Cancel this meeting" }),
    ).toHaveAttribute(
      "href",
      "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
    );
    expect(
      screen.getByRole("link", { name: "Reschedule this meeting" }),
    ).toHaveAttribute(
      "href",
      "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
    );
    expect(
      screen.queryByRole("link", {
        name: "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/token=abc/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Copy / }),
    ).not.toBeInTheDocument();
  });

  it("opens Edit details from confirmation, prefills, and shows saved values", async () => {
    const user = userEvent.setup({ delay: null });
    const patches: Array<Record<string, unknown>> = [];

    server.use(
      pageHandler(),
      slotsInWindow([currentSlot]),
      reservationGetHandler({
        guestName: "Ada Lovelace",
        notes: "bring coffee",
      }),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/reservations`,
        async (_req, res, ctx) =>
          res(
            ctx.status(Status.OK),
            ctx.json({
              reservationId: "000000000000000000000099",
              slotStart: currentSlot.slotStart,
              slotEnd: currentSlot.slotEnd,
              guestTimeZone: "UTC",
              cancelUrl:
                "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
              rescheduleUrl:
                "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
            }),
          ),
      ),
      rest.patch(
        `${ENV_WEB.API_BASEURL}/booking/reservations/000000000000000000000099`,
        async (req, res, ctx) => {
          const body = (await req.json()) as Record<string, unknown>;
          patches.push(body);
          return res(
            ctx.status(Status.OK),
            ctx.json({
              slotStart: currentSlot.slotStart,
              guestTimeZone: "UTC",
              durationMinutes: 30,
              hostDisplayName: "Tyler Dane",
              status: "confirmed",
              bookingSlug: "tylerdane",
              guestName: body.name,
              notes: body.notes,
            }),
          );
        },
      ),
    );

    renderBookingRoute("/meet/tylerdane");
    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Notes (optional)"), "bring coffee");
    await user.click(screen.getByRole("button", { name: "Confirm meeting" }));

    expect(
      await screen.findByRole("button", { name: "Edit details" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("bring coffee")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit details" }));

    const editHeading = await screen.findByRole("heading", {
      name: "Edit details",
    });
    expect(editHeading).toHaveFocus();
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue(
      "bring coffee",
    );
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Grace Hopper");
    await user.clear(screen.getByLabelText("Notes (optional)"));
    await user.type(screen.getByLabelText("Notes (optional)"), "bring tea");
    await user.click(screen.getByRole("button", { name: "Save details" }));

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("bring tea")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(patches).toEqual([
      { token: "abc", name: "Grace Hopper", notes: "bring tea" },
    ]);
  });

  it("returns from Edit details to confirmation on Escape", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      pageHandler(),
      slotsInWindow([currentSlot]),
      reservationGetHandler({
        guestName: "Ada Lovelace",
        notes: "bring coffee",
      }),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/reservations`,
        async (_req, res, ctx) =>
          res(
            ctx.status(Status.OK),
            ctx.json({
              reservationId: "000000000000000000000099",
              slotStart: currentSlot.slotStart,
              slotEnd: currentSlot.slotEnd,
              guestTimeZone: "UTC",
              cancelUrl:
                "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
              rescheduleUrl:
                "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
            }),
          ),
      ),
    );

    const { router } = renderBookingRoute("/meet/tylerdane");
    await user.click(
      await screen.findByRole("button", {
        name: slotButtonName(currentSlot.slotStart),
      }),
    );
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Confirm meeting" }));
    await user.click(
      await screen.findByRole("button", { name: "Edit details" }),
    );
    await screen.findByRole("heading", { name: "Edit details" });
    await user.keyboard("{Escape}");

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      "/meet/confirmed/000000000000000000000099",
    );
  });
});
