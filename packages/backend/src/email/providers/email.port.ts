import { type IncomingHttpHeaders } from "node:http";

export type EmailWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

export type EmailTemplateSend = {
  id: string;
  variables: Record<string, string>;
};

export type EmailSendInput = {
  idempotencyKey: string;
  to: string;
  headers: Record<string, string>;
} & (
  | {
      template: EmailTemplateSend;
      subject?: string;
      html?: never;
      text?: never;
    }
  | {
      template?: never;
      subject: string;
      html: string;
      text: string;
    }
);

export type EmailProvider = {
  send(input: EmailSendInput): Promise<{ messageId: string }>;
  verifyWebhook(
    rawBody: Buffer,
    headers: IncomingHttpHeaders,
  ): EmailWebhookEvent[];
};
