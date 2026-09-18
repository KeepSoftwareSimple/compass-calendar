import { QueryClient } from "@tanstack/react-query";
import { Status } from "@core/errors/status.codes";
import dayjs from "@core/util/date/dayjs";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { rest } from "@web/__tests__/helpers/msw-rest";
import {
  formatBookingMonthKey,
  shiftBookingMonthKey,
} from "@web/booking/public-booking.format";
import {
  prefetchPublicBookingMonth,
  publicBookingSlotsQueryOptions,
} from "@web/booking/public-booking.query";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { describe, expect, it } from "bun:test";

describe("prefetchPublicBookingMonth", () => {
  it("does not issue a second request for a month fetched within 60s", async () => {
    const timeZone = "UTC";
    const monthKey = formatBookingMonthKey(dayjs(), timeZone);
    const nextMonthKey = shiftBookingMonthKey(monthKey, 1, timeZone);
    let slotRequests = 0;

    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
        (_req, res, ctx) => {
          slotRequests += 1;
          return res(
            ctx.status(Status.OK),
            ctx.json({ bookable: true, slots: [] }),
          );
        },
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await prefetchPublicBookingMonth(
      queryClient,
      "tylerdane",
      nextMonthKey,
      timeZone,
      60,
    );
    expect(slotRequests).toBe(1);

    await queryClient.fetchQuery(
      publicBookingSlotsQueryOptions("tylerdane", nextMonthKey, timeZone, 60),
    );
    expect(slotRequests).toBe(1);
  });

  it("skips months that are entirely in the past", async () => {
    const timeZone = "UTC";
    const pastMonthKey = shiftBookingMonthKey(
      formatBookingMonthKey(dayjs(), timeZone),
      -1,
      timeZone,
    );
    let slotRequests = 0;

    server.use(
      rest.get(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
        (_req, res, ctx) => {
          slotRequests += 1;
          return res(
            ctx.status(Status.OK),
            ctx.json({ bookable: true, slots: [] }),
          );
        },
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await prefetchPublicBookingMonth(
      queryClient,
      "tylerdane",
      pastMonthKey,
      timeZone,
      60,
    );
    expect(slotRequests).toBe(0);
  });
});
