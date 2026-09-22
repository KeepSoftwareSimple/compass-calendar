import { Status } from "@core/errors/status.codes";
import { CONFIG } from "@backend/common/constants/config.constants";
import emailWebhookController from "@backend/email/controllers/email.webhook.controller";
import * as emailClient from "@backend/email/providers/email.client";
import * as webhookService from "@backend/email/services/email.webhook.service";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const buildRes = () => {
  const captured: { status: number; payload: unknown } = {
    status: 0,
    payload: undefined,
  };
  const res = {
    status: mock((code: number) => {
      captured.status = code;
      return res;
    }),
    json: mock((value: unknown) => {
      captured.payload = value;
    }),
  };
  return { res, captured };
};

describe("EmailWebhookController", () => {
  const originalProvider = CONFIG.EMAIL_PROVIDER;

  afterEach(() => {
    CONFIG.EMAIL_PROVIDER = originalProvider;
    mock.restore();
  });

  it("returns 400 when signature verification fails", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send: mock(async () => ({ messageId: "x" })),
      verifyWebhook: () => {
        throw new Error("bad signature");
      },
    });
    const process = spyOn(webhookService, "processEmailWebhookEvent");

    const req = { body: Buffer.from("{}"), headers: {} } as never;
    const { res, captured } = buildRes();

    await emailWebhookController.handleResend(req, res as never);

    expect(captured.status).toBe(Status.BAD_REQUEST);
    expect(process).not.toHaveBeenCalled();
    expect(captured.payload).toEqual({ error: "bad signature" });
  });

  it("returns 400 for an empty unsigned request", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    const process = spyOn(webhookService, "processEmailWebhookEvent");

    const req = { body: undefined, headers: {} } as never;
    const { res, captured } = buildRes();

    await emailWebhookController.handleResend(req, res as never);

    expect(captured.status).toBe(Status.BAD_REQUEST);
    expect(process).not.toHaveBeenCalled();
    expect(captured.payload).toEqual({ error: "Invalid webhook payload" });
  });

  it("returns 500 when a verified event fails to process", async () => {
    CONFIG.EMAIL_PROVIDER = "log";
    spyOn(emailClient, "buildEmailProvider").mockReturnValue({
      send: mock(async () => ({ messageId: "x" })),
      verifyWebhook: () => [{ type: "email.delivered", data: {} }],
    });
    spyOn(webhookService, "processEmailWebhookEvent").mockRejectedValue(
      new Error("mongo down"),
    );

    const req = {
      body: Buffer.from("{}"),
      headers: { "svix-id": "msg_1" },
    } as never;
    const { res, captured } = buildRes();

    await emailWebhookController.handleResend(req, res as never);

    expect(captured.status).toBe(Status.INTERNAL_SERVER);
    expect(captured.payload).toEqual({ error: "Webhook processing failed" });
  });
});
