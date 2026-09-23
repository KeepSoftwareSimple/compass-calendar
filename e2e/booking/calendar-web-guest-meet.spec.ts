import { expect, test } from "@playwright/test";

test("calendar-web redirects /meet to booking-web instead of serving the guest SPA", async ({
  request,
}) => {
  const bookingPort = process.env.BOOKING_WEB_PORT ?? "9151";
  const response = await request.get("/meet/tylerdane", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  const location = response.headers().location ?? "";
  expect(location).toMatch(/\/meet\/tylerdane$/);
  expect(location).toMatch(new RegExp(`:${bookingPort}/`));
});
