import { NodeEnv } from "@core/constants/core.constants";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { showAppUpdateAvailableToast } from "@web/common/utils/toast/app-update-available.toast";

declare global {
  interface Window {
    __compassE2E?: {
      showAppUpdateAvailableToast: typeof showAppUpdateAvailableToast;
    };
  }
}

/** Playwright-only hooks for deterministic notice layout tests. */
export function mountCompassE2EHelpers(): void {
  if (ENV_WEB.NODE_ENV !== NodeEnv.Test) return;

  window.__compassE2E = { showAppUpdateAvailableToast };
}
