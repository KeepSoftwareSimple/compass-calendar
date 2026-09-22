import type express from "express";
import { urlencoded } from "express";
import rateLimit from "express-rate-limit";
import { APPLE_SIGNIN_FORM_POST_PATH } from "@backend/auth/services/apple/apple.auth.callback";
import { verifySession } from "@backend/auth/session/session.middleware";
import { CommonRoutesConfig } from "@backend/common/common.routes.config";
import authController from "./controllers/auth.controller";
import authMiddleware from "./middleware/auth.middleware";

export const credentialConnectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const session = (
      req as express.Request & { session?: { getUserId(): string } }
    ).session;
    return session?.getUserId() ?? req.ip ?? "anonymous";
  },
});

export const appleSignInCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? "anonymous",
});

/**
 * Routes with the verifyIsDev middleware are
 * only available when running the app in dev,
 * as they are not called by production code.
 */
export class AuthRoutes extends CommonRoutesConfig {
  constructor(app: express.Application) {
    super(app, "AuthRoutes");
  }

  configureRoutes(): express.Application {
    const requireSession = verifySession() as express.RequestHandler;

    this.app
      .route(`/api/auth/session`)
      .all(authMiddleware.verifyIsDev)
      .post((req, res) => {
        void authController.createSession(req, res);
      })
      .get(requireSession, (req, res) => {
        authController.getUserIdFromSession(req, res);
      });

    // Returns the provider consent URL for the browser to navigate to.
    this.app
      .route(`/api/auth/connections/begin`)
      .all(requireSession)
      .post((req, res) => {
        authController.beginConnection(req, res);
      });

    this.app
      .route(`/api/auth/connections/credential`)
      .all(requireSession)
      .post(credentialConnectLimiter, (req, res) => {
        authController.connectCredential(req, res);
      });

    this.app
      .route(`/api/auth/connections/refresh`)
      .all(requireSession)
      .post((req, res) => {
        authController.refreshConnection(req, res);
      });

    this.app
      .route(`/api/auth/connections/:connectionId`)
      .all(requireSession)
      .delete((req, res) => {
        authController.disconnectConnection(req, res);
      });

    this.app
      .route(APPLE_SIGNIN_FORM_POST_PATH)
      .post(
        appleSignInCallbackLimiter,
        urlencoded({ extended: false }),
        (req, res) => {
          authController.appleSignInCallback(req, res);
        },
      );

    return this.app;
  }
}
