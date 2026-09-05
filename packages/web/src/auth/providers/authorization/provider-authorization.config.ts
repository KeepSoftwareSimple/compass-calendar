import { ENV_WEB } from "@web/common/constants/env.constants";

export function getMicrosoftSignInClientId(): string {
  return ENV_WEB.MICROSOFT_CLIENT_ID?.trim() ?? "";
}
