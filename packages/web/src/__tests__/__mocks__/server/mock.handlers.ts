import { faker } from "@faker-js/faker";
import { rest } from "msw";
import { Origin } from "@core/constants/core.constants";
import { Status } from "@core/errors/status.codes";
import { DEFAULT_WEEKLY_AVAILABILITY } from "@core/types/booking.contracts";
import { createMockStandaloneEvent } from "@core/util/test/ccal.event.factory";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { freshenEventStartEndDate } from "@web/views/Week/week-view.render.test.utils";

const createGoogleImportEvent: typeof createMockStandaloneEvent = (
  overrides = {},
  allDayEvent,
  dateDiff,
) =>
  createMockStandaloneEvent(
    { origin: Origin.GOOGLE_IMPORT, ...overrides },
    allDayEvent,
    dateDiff,
  );

// Authenticated mounts that race past session auth may fetch /calendars.
// Do not register a global handler here: a default success changes event-list
// calendarIds and breaks suite-order-dependent hook/grid tests that expect
// the legacy undefined (all-calendars) read until calendars are seeded.
// Tests that need a default response can server.use(rest.get(...)) locally.

export const globalHandlers = [
  rest.get("http://localhost/version.json", (_req, res, ctx) => {
    return res(ctx.json({ version: "dev" }));
  }),
  rest.get(
    `${ENV_WEB.API_BASEURL}/calendars/availability`,
    (_req, res, ctx) => {
      return res(ctx.status(Status.OK), ctx.json({ busyPeriods: [] }));
    },
  ),
  rest.get(`${ENV_WEB.API_BASEURL}/event`, (_req, res, ctx) => {
    const events = [
      createGoogleImportEvent(),
      createGoogleImportEvent({}, true),
      createGoogleImportEvent({ isAllDay: true }, true, {
        value: 21,
        unit: "days",
      }),
      createGoogleImportEvent(),
      freshenEventStartEndDate(createGoogleImportEvent()),
    ];
    return res(ctx.json(events));
  }),
  rest.delete(`${ENV_WEB.API_BASEURL}/event/:id`, (_req, res, ctx) => {
    return res(ctx.json({ acknowledged: true, deletedCount: 1 }));
  }),
  rest.options(`${ENV_WEB.API_BASEURL}/event`, (_req, res, ctx) => {
    return res(ctx.json([]));
  }),
  rest.get(`${ENV_WEB.API_BASEURL}/user/profile`, (_req, res, ctx) => {
    return res(
      ctx.status(Status.OK),
      ctx.json({
        userId: "test-user-123",
        email: "test@example.com",
        name: faker.person.fullName(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        photo: faker.image.avatar(),
      }),
    );
  }),
  rest.get(`${ENV_WEB.API_BASEURL}/user/metadata`, (_req, res, ctx) => {
    return res(ctx.status(Status.OK), ctx.json({}));
  }),
  rest.get(`${ENV_WEB.API_BASEURL}/billing/status`, (_req, res, ctx) => {
    return res(
      ctx.status(Status.OK),
      ctx.json({
        subscriptionStatus: "active",
        trialEndsAt: null,
        isReadOnly: false,
      }),
    );
  }),
  rest.get(`${ENV_WEB.API_BASEURL}/billing/subscription`, (_req, res, ctx) => {
    return res(
      ctx.status(Status.OK),
      ctx.json({
        subscriptionStatus: "active",
        currentPeriodEnd: "2099-06-15T12:00:00.000Z",
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
        price: { amount: 1200, currency: "usd", interval: "month" },
        paymentMethod: {
          brand: "visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2099,
        },
        invoices: [
          {
            id: "in_test_1",
            createdAt: "2099-05-15T12:00:00.000Z",
            amountPaid: 1200,
            currency: "usd",
            status: "paid",
            hostedInvoiceUrl: "https://invoice.stripe.com/test",
          },
        ],
      }),
    );
  }),
  rest.post(
    `${ENV_WEB.API_BASEURL}/booking/page/new-meetings/claim`,
    (_req, res, ctx) => {
      return res(ctx.status(Status.OK), ctx.json({ reservations: [] }));
    },
  ),
  rest.get(`${ENV_WEB.API_BASEURL}/booking/page/status`, (_req, res, ctx) => {
    return res(
      ctx.status(Status.OK),
      ctx.json({ bookable: true, reasons: [] }),
    );
  }),
  rest.get(`${ENV_WEB.API_BASEURL}/booking/page`, (_req, res, ctx) => {
    return res(
      ctx.status(Status.OK),
      ctx.json({
        id: "000000000000000000000001",
        slug: "hostuser",
        hostUserId: "000000000000000000000002",
        enabled: false,
        durationMinutes: 30,
        destinationCalendarId: "000000000000000000000001",
        blockingCalendarIds: ["000000000000000000000001"],
        timeZone: "UTC",
        weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
        minNoticeHours: 4,
        maxHorizonDays: 60,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        bookingUrl: "https://compasscalendar.com/meet/hostuser",
      }),
    );
  }),
  rest.get(`${ENV_WEB.API_BASEURL}/booking/pages/:slug`, (_req, res, ctx) => {
    return res(ctx.status(Status.NOT_FOUND), ctx.json({ code: "NOT_FOUND" }));
  }),
  rest.get(
    `${ENV_WEB.API_BASEURL}/booking/pages/:slug/slots`,
    (_req, res, ctx) => {
      return res(
        ctx.status(Status.OK),
        ctx.json({ slots: [], bookable: true }),
      );
    },
  ),
  rest.get(`${ENV_WEB.API_BASEURL}/config`, (_req, res, ctx) => {
    return res(
      ctx.status(Status.OK),
      ctx.json({
        version: "dev",
        google: { isConfigured: false },
        billing: {
          isConfigured: false,
          enforcement: true,
          trialLengthDays: 7,
        },
      }),
    );
  }),
  rest.post(`${ENV_WEB.API_BASEURL}/user/metadata`, (req, res, ctx) => {
    return res(ctx.status(Status.OK), ctx.json(req.json()));
  }),
  rest.post(`${ENV_WEB.API_BASEURL}/signinup`, (_req, res, ctx) => {
    return res(ctx.json({ isNewUser: true }));
  }),
  rest.post(`${ENV_WEB.API_BASEURL}/session/refresh`, (_req, res, ctx) => {
    return res(
      ctx.set("access-token", faker.internet.jwt()),
      ctx.set("front-token", faker.internet.jwt()),
      ctx.set("refresh-token", faker.internet.jwt()),
      ctx.cookie("sAccessToken", faker.internet.jwt()),
      ctx.cookie("sFrontendToken", faker.internet.jwt()),
      ctx.cookie("sRefreshToken", faker.internet.jwt()),
      ctx.json({ ok: true }),
    );
  }),
];
