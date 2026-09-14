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

const slugLimiter = (prefix: string, limit: number) =>
  bookingLimiter({ prefix, limit, keyGenerator: bookingSlugKey });

const reservationLimiter = (prefix: string, limit: number) =>
  bookingLimiter({ prefix, limit, keyGenerator: bookingReservationKey });

const adminLimiter = (prefix: string, limit: number) =>
  bookingLimiter({ prefix, limit, keyGenerator: bookingAdminKey });

// Shared Mongo buckets: N replicas share one budget per (caller, target).
const publicPageLimiter = slugLimiter("booking:page", 60);
const publicSlotsLimiter = slugLimiter("booking:slots", 60);
const publicConfirmLimiter = slugLimiter("booking:confirm", 10);
const publicReservationGetLimiter = reservationLimiter(
  "booking:reservation-get",
  30,
);
const publicCancelLimiter = reservationLimiter("booking:cancel", 10);
const publicReservationSlotsLimiter = reservationLimiter(
  "booking:reservation-slots",
  10,
);
const publicRescheduleLimiter = reservationLimiter("booking:reschedule", 10);
const publicReservationPatchLimiter = reservationLimiter(
  "booking:reservation-patch",
  10,
);
const adminPageGetLimiter = adminLimiter("booking:admin-get", 60);
const adminPageStatusGetLimiter = adminLimiter("booking:admin-status", 60);
const adminPagePutLimiter = adminLimiter("booking:admin-put", 20);
const adminNewMeetingsClaimLimiter = adminLimiter("booking:admin-claim", 20);

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
