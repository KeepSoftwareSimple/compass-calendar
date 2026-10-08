import express from "express";
import {
  BillingRoutes,
  sessionWriteLimiter,
} from "@backend/billing/billing.routes.config";
import billingController from "@backend/billing/controllers/billing.controller";
import { describe, expect, it } from "bun:test";

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: never[]) => unknown }>;
  };
};

describe("POST /api/billing/payment-method/session limiter", () => {
  it("sits behind sessionWriteLimiter", () => {
    const app = express();
    new BillingRoutes(app);
    const appWithRouter = app as unknown as {
      router?: { stack?: RouteLayer[] };
      _router?: { stack?: RouteLayer[] };
    };
    const stack = appWithRouter.router?.stack ?? appWithRouter._router?.stack;
    const layer = stack?.find(
      (entry) =>
        entry.route?.path === "/api/billing/payment-method/session" &&
        entry.route.methods["post"],
    );
    const handles = (layer?.route?.stack ?? []).map((item) => item.handle);
    expect(handles).toContain(sessionWriteLimiter);
    expect(handles).toContain(billingController.createPaymentMethodSession);
  });
});
