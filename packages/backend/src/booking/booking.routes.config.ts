import type express from "express";
import rateLimit, { type Options } from "express-rate-limit";
import { type SessionRequest } from "supertokens-node/framework/express";
import { Logger } from "@core/logger/winston.logger";
import { isBookingEnabled } from "@core/util/env.util";
import { verifySession } from "@backend/auth/session/session.middleware";
import { bookingPublicRateLimitKey } from "@backend/booking/booking-client-ip";
import { createBookingRateLimitStore } from "@backend/booking/booking-rate-limit.store";
import bookingController from "@backend/booking/controllers/booking.controller";
import { CommonRoutesConfig } from "@backend/common/common.routes.config";
import { CONFIG } from "@backend/common/constants/config.constants";

const logger = Logger("app:booking.rate-limit");

const MINUTE_MS = 60 * 1000;

const bookingSlugKey = (req: express.Request): string =>
  bookingPublicRateLimitKey(req.ip, req.params["slug"]);

const bookingReservationKey = (req: express.Request): string =>
  bookingPublicRateLimitKey(req.ip, req.params["id"]);

const bookingAdminKey = (req: express.Request): string =>
  `booking-admin:${(req as SessionRequest).session?.getUserId?.() ?? "unknown"}`;

const rateLimitedMessage = {
  code: "RATE_LIMITED",
  message: "Too many requests. Try again in a minute.",
};

const onLimitReached: Options["handler"] = (
  _request,
  response,
  _next,
  options,
) => {
  const store = options.store;
  const limiter =
    store && "prefix" in store && typeof store.prefix === "string"
      ? store.prefix
      : "booking";
  logger.info("Booking rate limit exceeded", { limiter });
  response.setHeader("Retry-After", String(Math.ceil(options.windowMs / 1000)));
  response.status(options.statusCode).json(rateLimitedMessage);
};

const bookingLimiter = (options: {
  prefix: string;
  limit: number;
  keyGenerator: Options["keyGenerator"];
}) =>
  rateLimit({
    windowMs: MINUTE_MS,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: false,
    store: createBookingRateLimitStore(options.prefix),
    keyGenerator: options.keyGenerator,
    handler: onLimitReached,
  });

// Shared Mongo buckets: N replicas share one budget per (caller, target).
const publicPageLimiter = bookingLimiter({
  prefix: "booking:page",
  limit: 60,
  keyGenerator: bookingSlugKey,
});

const publicSlotsLimiter = bookingLimiter({
  prefix: "booking:slots",
  limit: 60,
  keyGenerator: bookingSlugKey,
});

const publicConfirmLimiter = bookingLimiter({
  prefix: "booking:confirm",
  limit: 10,
  keyGenerator: bookingSlugKey,
});

const publicReservationGetLimiter = bookingLimiter({
  prefix: "booking:reservation-get",
  limit: 30,
  keyGenerator: bookingReservationKey,
});

const publicCancelLimiter = bookingLimiter({
  prefix: "booking:cancel",
  limit: 10,
  keyGenerator: bookingReservationKey,
});

const publicReservationSlotsLimiter = bookingLimiter({
  prefix: "booking:reservation-slots",
  limit: 10,
  keyGenerator: bookingReservationKey,
});

const publicRescheduleLimiter = bookingLimiter({
  prefix: "booking:reschedule",
  limit: 10,
  keyGenerator: bookingReservationKey,
});

const publicReservationPatchLimiter = bookingLimiter({
  prefix: "booking:reservation-patch",
  limit: 10,
  keyGenerator: bookingReservationKey,
});

const adminPageGetLimiter = bookingLimiter({
  prefix: "booking:admin-get",
  limit: 60,
  keyGenerator: bookingAdminKey,
});

const adminPageStatusGetLimiter = bookingLimiter({
  prefix: "booking:admin-status",
  limit: 60,
  keyGenerator: bookingAdminKey,
});

const adminPagePutLimiter = bookingLimiter({
  prefix: "booking:admin-put",
  limit: 20,
  keyGenerator: bookingAdminKey,
});

const adminNewMeetingsClaimLimiter = bookingLimiter({
  prefix: "booking:admin-claim",
  limit: 20,
  keyGenerator: bookingAdminKey,
});

/**
 * Host admin routes require a session. Public guest routes are unauthenticated.
 */
export class BookingRoutes extends CommonRoutesConfig {
  constructor(app: express.Application) {
    super(app, "BookingRoutes");
  }

  configureRoutes(): express.Application {
    if (!isBookingEnabled(CONFIG.NODE_ENV)) {
      return this.app;
    }

    this.app
      .route(`/api/booking/page/new-meetings/claim`)
      .all(verifySession())
      .post(adminNewMeetingsClaimLimiter, bookingController.claimNewMeetings);

    this.app
      .route(`/api/booking/page/status`)
      .all(verifySession())
      .get(adminPageStatusGetLimiter, bookingController.getPageStatus);

    this.app
      .route(`/api/booking/page`)
      .all(verifySession())
      .get(adminPageGetLimiter, bookingController.getPage)
      .put(adminPagePutLimiter, bookingController.putPage);

    this.app
      .route(`/api/booking/pages/:slug`)
      .get(publicPageLimiter, bookingController.getPublicPage);

    this.app
      .route(`/api/booking/pages/:slug/slots`)
      .get(publicSlotsLimiter, bookingController.getPublicSlots);

    this.app
      .route(`/api/booking/pages/:slug/reservations`)
      .post(publicConfirmLimiter, bookingController.createReservation);

    this.app
      .route(`/api/booking/reservations/:id`)
      .get(publicReservationGetLimiter, bookingController.getPublicReservation)
      .patch(
        publicReservationPatchLimiter,
        bookingController.patchPublicReservation,
      );

    this.app
      .route(`/api/booking/reservations/:id/cancel`)
      .post(publicCancelLimiter, bookingController.cancelReservation);

    this.app
      .route(`/api/booking/reservations/:id/slots`)
      .get(
        publicReservationSlotsLimiter,
        bookingController.getReservationSlots,
      );

    this.app
      .route(`/api/booking/reservations/:id/reschedule`)
      .post(publicRescheduleLimiter, bookingController.rescheduleReservation);

    return this.app;
  }
}
