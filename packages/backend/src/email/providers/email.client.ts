import { type Config } from "@backend/common/constants/config.constants";
import { type EmailProvider } from "@backend/email/providers/email.port";
import { createLogEmailProvider } from "@backend/email/providers/log.provider";
import { createResendEmailProvider } from "@backend/email/providers/resend.provider";

export type EmailConfigSlice = Pick<
  Config,
  | "EMAIL_PROVIDER"
  | "EMAIL_API_KEY"
  | "EMAIL_FROM"
  | "EMAIL_WEBHOOK_SECRET"
  | "EMAIL_UNSUBSCRIBE_SECRET"
>;

export function buildEmailProvider(env: EmailConfigSlice): EmailProvider {
  if (
    env.EMAIL_PROVIDER === "resend" &&
    env.EMAIL_API_KEY &&
    env.EMAIL_FROM &&
    env.EMAIL_WEBHOOK_SECRET
  ) {
    return createResendEmailProvider({
      apiKey: env.EMAIL_API_KEY,
      from: env.EMAIL_FROM,
      webhookSecret: env.EMAIL_WEBHOOK_SECRET,
    });
  }
  return createLogEmailProvider();
}
