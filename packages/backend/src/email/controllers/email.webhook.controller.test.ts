import { Status } from "@core/errors/status.codes";
import { CONFIG } from "@backend/common/constants/config.constants";
import emailWebhookController from "@backend/email/controllers/email.webhook.controller";
import * as emailClient from "@backend/email/providers/email.client";
import * as webhookService from "@backend/email/services/email.webhook.service";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

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
    let status = 0;
    let payload: unknown;
    const res = {
      status: mock((code: number) => {
        status = code;
        return res;
      }),
      json: mock((value: unknown) => {
        payload = value;
      }),
    };

    await emailWebhookController.handleResend(req, res as never);

    expect(status).toBe(Status.BAD_REQUEST);
    expect(process).not.toHaveBeenCalled();
    expect(payload).toEqual({ error: "bad signature" });
  });
});
