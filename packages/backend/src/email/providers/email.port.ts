import { type IncomingHttpHeaders } from "node:http";

export type EmailWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

export type EmailProvider = {
  send(input: {
    idempotencyKey: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers: Record<string, string>;
  }): Promise<{ messageId: string }>;
  verifyWebhook(
    rawBody: Buffer,
    headers: IncomingHttpHeaders,
  ): EmailWebhookEvent[];
};
