import express from "express";
import {
  BillingRoutes,
  billingReadLimiter,
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

const routeHandles = (path: string, method: string): unknown[] => {
  const app = express();
  new BillingRoutes(app);
  const appWithRouter = app as unknown as {
    router?: { stack?: RouteLayer[] };
    _router?: { stack?: RouteLayer[] };
  };
  const stack = appWithRouter.router?.stack ?? appWithRouter._router?.stack;
  const layer = stack?.find(
    (entry) => entry.route?.path === path && entry.route.methods[method],
  );
  return (layer?.route?.stack ?? []).map((item) => item.handle);
};

describe("BillingRoutes limiters", () => {
  it("puts POST /api/billing/checkout/session behind sessionWriteLimiter", () => {
    const handles = routeHandles("/api/billing/checkout/session", "post");
    expect(handles).toContain(sessionWriteLimiter);
    expect(handles).toContain(billingController.createCheckoutSession);
  });

  it("does not mount a Customer Portal session route", () => {
    expect(routeHandles("/api/billing/portal/session", "post")).toEqual([]);
  });

  it("puts GET /api/billing/subscription behind billingReadLimiter", () => {
    const handles = routeHandles("/api/billing/subscription", "get");
    expect(handles).toContain(billingReadLimiter);
    expect(handles).toContain(billingController.getSubscription);
  });

  it("puts cancel and resume behind sessionWriteLimiter", () => {
    const cancel = routeHandles("/api/billing/subscription/cancel", "post");
    const resume = routeHandles("/api/billing/subscription/resume", "post");
    expect(cancel).toContain(sessionWriteLimiter);
    expect(cancel).toContain(billingController.cancelSubscription);
    expect(resume).toContain(sessionWriteLimiter);
    expect(resume).toContain(billingController.resumeSubscription);
  });
});
