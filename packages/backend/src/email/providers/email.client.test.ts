import { buildEmailProvider } from "@backend/email/providers/email.client";
import { createLogEmailProvider } from "@backend/email/providers/log.provider";
import { describe, expect, it } from "bun:test";

describe("email provider factory", () => {
  const resendEnv = {
    EMAIL_PROVIDER: "resend" as const,
    EMAIL_API_KEY: "re_test_key",
    EMAIL_FROM: "Compass <hello@mail.compasscalendar.com>",
    EMAIL_WEBHOOK_SECRET: "whsec_test",
    EMAIL_UNSUBSCRIBE_SECRET: "unsub-secret",
  };

  it("returns the log adapter when no API key is configured", () => {
    const provider = buildEmailProvider({
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: undefined,
      EMAIL_FROM: "Compass <hello@mail.compasscalendar.com>",
      EMAIL_WEBHOOK_SECRET: "whsec_test",
      EMAIL_UNSUBSCRIBE_SECRET: "unsub-secret",
    });

    expect(provider.verifyWebhook(Buffer.from("{}"), {})).toEqual([]);
  });

  it("returns the resend adapter when an API key is configured", () => {
    const provider = buildEmailProvider(resendEnv);

    expect(() => provider.verifyWebhook(Buffer.from("{}"), {})).toThrow(
      "Svix signature headers",
    );
  });
});

describe("log email provider", () => {
  it("returns a message id without network access", async () => {
    const provider = createLogEmailProvider();
    const result = await provider.send({
      idempotencyKey: "user-1:welcome-1",
      to: "guest@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
      headers: {},
    });

    expect(result.messageId).toMatch(/^log-/);
  });
});
