import { ENV_WEB } from "@web/common/constants/env.constants";

export function isPosthogEnabled() {
  return !!ENV_WEB.POSTHOG_HOST && !!ENV_WEB.POSTHOG_KEY;
}
