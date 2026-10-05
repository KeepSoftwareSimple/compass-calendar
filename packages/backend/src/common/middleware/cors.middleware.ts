import cors from "cors";
import { type RequestHandler } from "express";
import { APPLE_SIGNIN_FORM_POST_PATH } from "@backend/auth/services/apple/apple.auth.callback";
import { CONFIG } from "@backend/common/constants/config.constants";

const corsWhitelist = cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (CONFIG.ORIGINS_ALLOWED.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
});

const corsMiddleware: RequestHandler = (req, res, next) => {
  // Apple's form_post is a top-level navigation, not a cross-origin API read.
  // Let the callback validate its state without granting Apple API CORS access.
  if (
    req.method === "POST" &&
    req.path === APPLE_SIGNIN_FORM_POST_PATH &&
    req.get("origin") === "https://appleid.apple.com"
  ) {
    next();
    return;
  }

  corsWhitelist(req, res, next);
};

export default corsMiddleware;
