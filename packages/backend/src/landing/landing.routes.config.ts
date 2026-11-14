import type express from "express";
import rateLimit from "express-rate-limit";
import { CommonRoutesConfig } from "@backend/common/common.routes.config";
import { requestDesktopReminder } from "@backend/landing/desktop-reminder.controller";

// Unauthenticated and it sends email, so keep it tight: a visitor needs one
// request, and nobody should be able to use it to flood an inbox.
const desktopReminderLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

export class LandingRoutes extends CommonRoutesConfig {
  constructor(app: express.Application) {
    super(app, "LandingRoutes");
  }

  configureRoutes(): express.Application {
    this.app
      .route("/api/landing/desktop-reminder")
      .post(desktopReminderLimiter, requestDesktopReminder);

    return this.app;
  }
}
