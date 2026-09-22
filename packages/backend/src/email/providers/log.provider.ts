import { Logger } from "@core/logger/winston.logger";
import { type EmailProvider } from "@backend/email/providers/email.port";
import { randomUUID } from "node:crypto";

const logger = Logger("app:email.log");

export function createLogEmailProvider(): EmailProvider {
  return {
    async send(input) {
      const headerLines = Object.entries(input.headers)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join("\n");
      logger.info(
        `Email (log provider)\n` +
          `  to: ${input.to}\n` +
          `  subject: ${input.subject}\n` +
          (headerLines ? `${headerLines}\n` : "") +
          `  text:\n${input.text}\n` +
          `  html:\n${input.html}`,
      );
      return { messageId: `log-${randomUUID()}` };
    },
    verifyWebhook() {
      return [];
    },
  };
}
