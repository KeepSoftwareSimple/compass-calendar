import { faker } from "@faker-js/faker";
import { http , HttpResponse} from "msw"
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
  http.get("http://localhost/version.json", () => {
    return HttpResponse.json(
{ version: "dev" },
);
  }),
  http.get(
    `${ENV_WEB.API_BASEURL}/calendars/availability`,
    () => {
      return HttpResponse.json(
{ busyPeriods: [] },
{status: Status.OK,
});
    },
  ),
  http.get(`${ENV_WEB.API_BASEURL}/event`, () => {
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
    return HttpResponse.json(
events,
);
  }),
  http.delete(`${ENV_WEB.API_BASEURL}/event/:id`, () => {
    return HttpResponse.json(
{ acknowledged: true, deletedCount: 1 },
);
  }),
  http.options(`${ENV_WEB.API_BASEURL}/event`, () => {
    return HttpResponse.json(
[],
);
  }),
  http.get(`${ENV_WEB.API_BASEURL}/user/profile`, () => {
    return HttpResponse.json(
{
        userId: "test-user-123",
        email: "test@example.com",
        name: faker.person.fullName(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        photo: faker.image.avatar(),
      },
{status: Status.OK,
});
  }),
  http.get(`${ENV_WEB.API_BASEURL}/user/metadata`, () => {
    return HttpResponse.json(
{},
{status: Status.OK,
});
  }),
  http.get(`${ENV_WEB.API_BASEURL}/billing/status`, () => {
    return HttpResponse.json(
{
        subscriptionStatus: "active",
        trialEndsAt: null,
        isReadOnly: false,
      },
{status: Status.OK,
});
  }),
  http.get(`${ENV_WEB.API_BASEURL}/billing/subscription`, () => {
    return HttpResponse.json(
{
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
      },
{status: Status.OK,
});
  }),
  http.post(
    `${ENV_WEB.API_BASEURL}/booking/page/new-meetings/claim`,
    () => {
      return HttpResponse.json(
{ reservations: [] },
{status: Status.OK,
});
    },
  ),
  http.get(`${ENV_WEB.API_BASEURL}/booking/page/status`, () => {
    return HttpResponse.json(
{ bookable: true, reasons: [] },
{status: Status.OK,
});
  }),
  http.get(`${ENV_WEB.API_BASEURL}/booking/page`, () => {
    return HttpResponse.json(
{
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
      },
{status: Status.OK,
});
  }),
  http.get(`${ENV_WEB.API_BASEURL}/booking/pages/:slug`, () => {
    return HttpResponse.json(
{ code: "NOT_FOUND" },
{status: Status.NOT_FOUND,
});
  }),
  http.get(
    `${ENV_WEB.API_BASEURL}/booking/pages/:slug/slots`,
    () => {
      return HttpResponse.json(
{ slots: [], bookable: true },
{status: Status.OK,
});
    },
  ),
  http.get(`${ENV_WEB.API_BASEURL}/config`, () => {
    return HttpResponse.json(
{
        version: "dev",
        google: { isConfigured: false },
        billing: {
          isConfigured: false,
          enforcement: true,
          trialLengthDays: 7,
        },
      },
{status: Status.OK,
});
  }),
  http.post(`${ENV_WEB.API_BASEURL}/user/metadata`, ({request}) => {
 let req = request;
    return HttpResponse.json(
req.json(),
{status: Status.OK,
});
  }),
  http.post(`${ENV_WEB.API_BASEURL}/signinup`, () => {
    return HttpResponse.json(
{ isNewUser: true },
);
  }),
  http.post(`${ENV_WEB.API_BASEURL}/session/refresh`, (_req, res, ctx) => {
    return HttpResponse.json(
{ ok: true },
{headers: {"access-token": faker.internet.jwt()"front-token": faker.internet.jwt()"refresh-token": faker.internet.jwt()"Set-Cookie": sAccessToken=aker.internet.jwt(;sFrontendToken=aker.internet.jwt(;sRefreshToken=aker.internet.jwt(;},
});
  }),
];
