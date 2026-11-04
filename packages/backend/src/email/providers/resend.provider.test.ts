import { createResendEmailProvider } from "@backend/email/providers/resend.provider";
import { afterEach, describe, expect, it, mock } from "bun:test";

describe("createResendEmailProvider", () => {
  it("transports PNG attachments and optional content IDs", async () => {
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.attachments).toEqual([
        {
          filename: "life.png",
          content: "cG5n",
          content_type: "image/png",
          content_id: "life",
        },
      ]);
      return new Response(JSON.stringify({ id: "re_image" }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const provider = createResendEmailProvider({
      apiKey: "test",
      from: "hello@example.com",
      webhookSecret: "test",
    });
    await provider.send({
      idempotencyKey: "reflection-test",
      to: "reader@example.com",
      headers: {},
      subject: "Reflection",
      html: '<img src="cid:life" alt="Life in weeks">',
      text: "Life in weeks",
      attachments: [
        {
          filename: "life.png",
          content: "cG5n",
          contentType: "image/png",
          contentId: "life",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it("posts a template payload when template send is requested", async () => {
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.template).toEqual({
        id: "compass-welcome",
        variables: {
          CTA_URL: "https://app.example.com/?utm_source=email",
          UNSUBSCRIBE_URL: "https://api.example.com/unsub",
        },
      });
      expect(body.html).toBeUndefined();
      expect(body.text).toBeUndefined();
      expect(body.from).toBe("Compass <hello@example.com>");
      expect(body.reply_to).toBe("tyler@keepsoftwaresimple.com");
      return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = createResendEmailProvider({
      apiKey: "re_test",
      from: "Compass <hello@example.com>",
      replyTo: "tyler@keepsoftwaresimple.com",
      webhookSecret: "whsec_test",
    });

    const result = await provider.send({
      idempotencyKey: "user:welcome",
      to: "guest@example.com",
      headers: { "List-Unsubscribe": "<https://api.example.com/unsub>" },
      template: {
        id: "compass-welcome",
        variables: {
          CTA_URL: "https://app.example.com/?utm_source=email",
          UNSUBSCRIBE_URL: "https://api.example.com/unsub",
        },
      },
    });

    expect(result.messageId).toBe("re_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts html payload when no template is provided", async () => {
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.subject).toBe("Hello");
      expect(body.html).toBe("<p>Hi</p>");
      expect(body.template).toBeUndefined();
      expect(body.reply_to).toBeUndefined();
      return new Response(JSON.stringify({ id: "re_456" }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = createResendEmailProvider({
      apiKey: "re_test",
      from: "Compass <hello@example.com>",
      webhookSecret: "whsec_test",
    });

    await provider.send({
      idempotencyKey: "preview",
      to: "guest@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
      headers: {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
