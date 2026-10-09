import {
  type SignupMethod,
  trackSignupFailed,
} from "@web/auth/posthog/signup-funnel";
import { DEFAULT_CALENDAR_ROUTE } from "@web/common/constants/routes";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";

type ReportAuthCallbackCrashOptions = {
  method: SignupMethod;
  errorMessage: string;
  replace: (path: string) => void;
};

/**
 * The backstop both OAuth callback views need when the exchange itself throws:
 * count the crash in the funnel, say so once, and get the user off the
 * callback route, which renders nothing but a spinner.
 *
 * Shared because a callback left on that route is unrecoverable, so the two
 * views must not drift on whether they leave it.
 */
export const reportAuthCallbackCrash =
  ({ method, errorMessage, replace }: ReportAuthCallbackCrashOptions) =>
  (error: unknown): void => {
    trackSignupFailed("oauth_callback_crashed", {
      method,
      error: error instanceof Error ? error.message : String(error),
    });
    showErrorToast(errorMessage);
    replace(DEFAULT_CALENDAR_ROUTE);
  };
