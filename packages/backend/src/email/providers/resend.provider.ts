import {
  type EmailProvider,
  type EmailWebhookEvent,
} from "@backend/email/providers/email.port";
import { createHmac, timingSafeEqual } from "node:crypto";
import { type IncomingHttpHeaders } from "node:http";

const RESEND_API_URL = "https://api.resend.com/emails";

function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const raw = headers[name];
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

function decodeSvixSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith("whsec_")
    ? trimmed.slice("whsec_".length)
    : trimmed;
  return Buffer.from(encoded, "base64");
}

function verifySvixSignature(
  rawBody: Buffer,
  headers: IncomingHttpHeaders,
  webhookSecret: string,
): void {
  const svixId = headerValue(headers, "svix-id");
  const svixTimestamp = headerValue(headers, "svix-timestamp");
  const svixSignature = headerValue(headers, "svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Resend webhook is missing Svix signature headers");
  }

  const secretBytes = decodeSvixSecret(webhookSecret);
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest();

  const signatures = svixSignature.split(" ").flatMap((part) => {
    const [, encoded] = part.split(",", 2);
    return encoded ? [encoded] : [];
  });

  const valid = signatures.some((encoded) => {
    const received = Buffer.from(encoded, "base64");
    if (received.length !== expected.length) return false;
    return timingSafeEqual(received, expected);
  });

  if (!valid) {
    throw new Error("Resend webhook signature verification failed");
  }
}

function parseWebhookPayload(rawBody: Buffer): EmailWebhookEvent[] {
  const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
  if (Array.isArray(parsed)) {
    return parsed as EmailWebhookEvent[];
  }
  if (parsed !== null && typeof parsed === "object" && "type" in parsed) {
    const event = parsed as EmailWebhookEvent;
    return [event];
  }
  throw new Error("Resend webhook payload is not a recognized event shape");
}

export function createResendEmailProvider(options: {
  apiKey: string;
  from: string;
  webhookSecret: string;
}): EmailProvider {
  return {
    async send(input) {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          from: options.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          headers: input.headers,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Resend send failed (${response.status}): ${body.slice(0, 500)}`,
        );
      }

      const payload = (await response.json()) as { id?: string };
      if (!payload.id) {
        throw new Error("Resend send response did not include an id");
      }
      return { messageId: payload.id };
    },
    verifyWebhook(rawBody, headers) {
      verifySvixSignature(rawBody, headers, options.webhookSecret);
      return parseWebhookPayload(rawBody);
    },
  };
}
