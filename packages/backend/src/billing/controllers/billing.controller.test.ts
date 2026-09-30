import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import { type BillingStatusResponse } from "@core/types/billing.types";
import billingService from "@backend/billing/services/billing.service";
import billingController from "./billing.controller";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const sessionReq = (userId: string) =>
  ({
    session: { getUserId: () => userId },
  }) as unknown as Request<never, BillingStatusResponse, never, never>;

const jsonRes = () => {
  const json = mock();
  const res = {
    status: mock().mockReturnThis(),
    json,
    send: mock().mockReturnThis(),
  } as unknown as Response;
  return { res, json };
};

describe("BillingController", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns status for the session user", async () => {
    const status: BillingStatusResponse = {
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-08-20T00:00:00.000Z",
      isReadOnly: false,
      cancelAtPeriodEnd: false,
    };
    spyOn(billingService, "getStatus").mockResolvedValue(status);

    const { res, json } = jsonRes();
    await billingController.getStatus(
      sessionReq("507f1f77bcf86cd799439011"),
      res,
    );

    expect(billingService.getStatus).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
    );
    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.OK,
    );
    expect(json).toHaveBeenCalledWith(status);
  });

  it("maps a missing user to 404 with a JSON body", async () => {
    spyOn(billingService, "getStatus").mockRejectedValue(
      new Error("User not found"),
    );

    const { res, json } = jsonRes();
    await billingController.getStatus(
      sessionReq("507f1f77bcf86cd799439011"),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.NOT_FOUND,
    );
    expect(json).toHaveBeenCalledWith({ error: "User not found" });
  });

  it("maps unexpected failures to a logged JSON 500", async () => {
    spyOn(billingService, "getStatus").mockRejectedValue(
      new Error("mongo down"),
    );

    const { res, json } = jsonRes();
    await billingController.getStatus(
      sessionReq("507f1f77bcf86cd799439011"),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.INTERNAL_SERVER,
    );
    expect(json).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  it("maps BillingHttpError to its status and client message", async () => {
    const { BillingHttpError } = await import(
      "@backend/billing/billing.errors"
    );
    spyOn(billingService, "getStatus").mockRejectedValue(
      new BillingHttpError(
        502,
        "Couldn't start billing. Please try again in a moment.",
      ),
    );

    const { res, json } = jsonRes();
    await billingController.getStatus(
      sessionReq("507f1f77bcf86cd799439011"),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      502,
    );
    expect(json).toHaveBeenCalledWith({
      error: "Couldn't start billing. Please try again in a moment.",
    });
  });
});
