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

describe("BookingRoutes production gate", () => {
  const originalNodeEnv = CONFIG.NODE_ENV;

  afterEach(() => {
    CONFIG.NODE_ENV = originalNodeEnv;
  });

  it("does not register /api/booking routes in production", () => {
    CONFIG.NODE_ENV = NodeEnv.Production;
    const app = express();
    new BookingRoutes(app);
    expect(bookingRoutePaths(app)).toEqual([]);
  });

  it("registers /api/booking routes outside production", () => {
    CONFIG.NODE_ENV = NodeEnv.Test;
    const app = express();
    new BookingRoutes(app);
    expect(bookingRoutePaths(app)).toContain("/api/booking/page");
    expect(bookingRoutePaths(app)).toContain("/api/booking/page/status");
    expect(bookingRoutePaths(app)).toContain("/api/booking/pages/:slug");
  });
});
