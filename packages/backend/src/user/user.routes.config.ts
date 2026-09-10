import type express from "express";
import rateLimit from "express-rate-limit";
import { type SessionRequest } from "supertokens-node/framework/express";
import { verifySession } from "@backend/auth/session/session.middleware";
import { CommonRoutesConfig } from "@backend/common/common.routes.config";
import userController from "./controllers/user.controller";

const accountDeletionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
});

const hiddenEventsKey = (req: express.Request): string =>
  `hidden-events:${(req as SessionRequest).session?.getUserId?.() ?? "unknown"}`;

const hiddenEventsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: hiddenEventsKey,
});

/**
 * User Routes Configuration
 *
 * Handles user profile and metadata management endpoints.
 * All routes require authentication via Supertokens session.
 */
export class UserRoutes extends CommonRoutesConfig {
  constructor(app: express.Application) {
    super(app, "UserRoutes");
  }

  configureRoutes(): express.Application {
    /**
     * GET /api/user/profile
     * Retrieves the current user's profile information
     *
     * @auth Required - Supertokens session
     * @returns {Object} User profile data including email, name, and settings
     * @throws {401} Unauthorized - Invalid or missing session
     * @throws {404} Not Found - User not found
     */
    this.app
      .route(`/api/user/profile`)
      .all(verifySession())
      .get(userController.getProfile);

    /**
     * DELETE /api/user
     * Deletes the current user's Compass account: all Compass data, their auth
     * identity, and their Google OAuth grant. Their Google Calendar data is
     * left untouched.
     *
     * The user is always taken from the session, so a caller can only ever
     * delete themselves.
     *
     * @auth Required - Supertokens session
     * @returns {Object} Summary of what was deleted
     * @throws {401} Unauthorized - Invalid or missing session
     */
    this.app
      .route(`/api/user`)
      .all(verifySession())
      .all(accountDeletionLimiter)
      .delete(userController.deleteAccount);

    /**
     * GET /api/user/metadata
     * Retrieves user metadata (preferences, settings, etc.)
     *
     * POST /api/user/metadata
     * Updates user metadata
     *
     * @auth Required - Supertokens session
     * @body {Object} metadata - User metadata to update
     * @returns {Object} Updated metadata
     * @throws {401} Unauthorized - Invalid or missing session
     * @throws {400} Bad Request - Invalid metadata format
     */
    this.app
      .route(`/api/user/metadata`)
      .all(verifySession())
      .get(userController.getMetadata)
      .post(userController.updateMetadata);

    /**
     * GET /api/user/hidden-events
     * Lists the current user's hidden event ids.
     *
     * PUT /api/user/hidden-events
     * Hides or shows one event for the current user. Body is
     * `{ eventId, hidden }`. Returns the full list so occurrence ids with
     * `::` never need to be encoded in the path.
     *
     * @auth Required - Supertokens session
     * @returns {Object} { hiddenEventIds: string[] }
     * @throws {401} Unauthorized - Invalid or missing session
     * @throws {400} Bad Request - Invalid input
     */
    this.app
      .route("/api/user/hidden-events")
      .all(verifySession())
      .get(hiddenEventsLimiter, userController.getHiddenEvents)
      .put(hiddenEventsLimiter, userController.setEventHidden);

    return this.app;
  }
}
