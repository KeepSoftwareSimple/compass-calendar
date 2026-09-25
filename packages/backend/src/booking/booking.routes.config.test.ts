import express from "express";
import { NodeEnv } from "@core/constants/core.constants";
import { BookingRoutes } from "@backend/booking/booking.routes.config";
import { CONFIG } from "@backend/common/constants/config.constants";
import { afterEach, describe, expect, it } from "bun:test";

function bookingRoutePaths(app: express.Express): string[] {
  const router = (
    app as unknown as {
      _router?: { stack?: Array<{ route?: { path?: string } }> };
    }
  )._router;
  return (router?.stack ?? []).flatMap((layer) => {
    const path = layer.route?.path;
    return path?.startsWith("/api/booking") ? [path] : [];
  });
}

describe("BookingRoutes registration", () => {
  const originalNodeEnv = CONFIG.NODE_ENV;

  afterEach(() => {
    CONFIG.NODE_ENV = originalNodeEnv;
  });

  it.each([NodeEnv.Test, NodeEnv.Production] as const)(
    "registers /api/booking routes when NODE_ENV is %s",
    (nodeEnv) => {
      CONFIG.NODE_ENV = nodeEnv;
      const app = express();
      new BookingRoutes(app);
      expect(bookingRoutePaths(app)).toContain("/api/booking/page");
      expect(bookingRoutePaths(app)).toContain(
        "/api/booking/page/new-meetings/claim",
      );
      expect(bookingRoutePaths(app)).toContain("/api/booking/page/status");
      expect(bookingRoutePaths(app)).toContain("/api/booking/pages/:slug");
    },
  );
});
