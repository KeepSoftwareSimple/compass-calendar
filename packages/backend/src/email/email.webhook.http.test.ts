import { Status } from "@core/errors/status.codes";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import emailWebhookController from "@backend/email/controllers/email.webhook.controller";
import { RESEND_WEBHOOK_PATH } from "@backend/email/email.routes.config";
import * as webhookService from "@backend/email/services/email.webhook.service";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createHmac } from "node:crypto";

const WEBHOOK_SECRET = "whsec_dGVzdC1zZWNyZXQ=";

const resendConfigured = {
  EMAIL_PROVIDER: "resend" as const,
  EMAIL_API_KEY: "re_test",
  EMAIL_FROM: "Compass <hello@example.com>",
  EMAIL_WEBHOOK_SECRET: WEBHOOK_SECRET,
  EMAIL_UNSUBSCRIBE_SECRET: "unsub-secret",
};

function signSvixPayload(payload: string, secret = WEBHOOK_SECRET) {
  const svixId = "msg_test_1";
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith("whsec_")
    ? trimmed.slice("whsec_".length)
    : trimmed;
  const secretBytes = Buffer.from(encoded, "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const signature = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  return {
    svixId,
    svixTimestamp,
    svixSignature: `v1,${signature}`,
  };
}

describe("Resend webhook HTTP stack", () => {
  afterEach(() => {
    mock.restore();
  });

  it("rejects a parsed JSON body at the controller so it cannot pass verification", async () => {
    using _env = mockEnv(resendConfigured);

    const process = spyOn(webhookService, "processEmailWebhookEvent");
    const captured = { status: 0 };
    const res = {
      status: mock((code: number) => {
        captured.status = code;
        return res;
      }),
      json: mock(() => {}),
    };

    await emailWebhookController.handleResend(
      { body: { type: "email.delivered" }, headers: {} } as never,
      res as never,
    );

    expect(captured.status).toBe(Status.BAD_REQUEST);
    expect(process).not.toHaveBeenCalled();
  });

  it("accepts a signed webhook over HTTP with pretty-printed JSON bytes intact", async () => {
    using _env = mockEnv(resendConfigured);

    const process = spyOn(
      webhookService,
      "processEmailWebhookEvent",
    ).mockResolvedValue(undefined);

    const event = {
      type: "email.delivered",
      data: { email_id: "em_1", to: ["guest@example.com"] },
    };
    // Pretty-printed so JSON.parse + stringify would change the bytes and
    // fail HMAC. The Express stack must hand the original payload through.
    const payload = JSON.stringify(event, null, 2);
    const { svixId, svixTimestamp, svixSignature } = signSvixPayload(payload);

    const driver = new BaseDriver();
    try {
      const uri = await driver.listen();
      const response = await fetch(`${uri}${RESEND_WEBHOOK_PATH}`, {
        method: "POST",
        headers: {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: payload,
      });

      expect(response.status).toBe(Status.OK);
      expect(await response.json()).toEqual({ received: true });
      expect(process).toHaveBeenCalledTimes(1);
    } finally {
      await driver.teardown();
    }
  });
});
