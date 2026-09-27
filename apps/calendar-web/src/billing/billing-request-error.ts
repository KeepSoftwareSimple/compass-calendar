import {
  getApiErrorMessage,
  isSessionLevelError,
} from "@web/api/util/api.util";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";

/** Stripe 500s are not useful to the user; keep the surface-specific fallback. */
export const showBillingRequestError = (
  error: unknown,
  fallback: string,
): void => {
  if (isSessionLevelError(error)) return;
  const fromApi = getApiErrorMessage(error);
  showErrorToast(
    fromApi && fromApi !== "Internal server error" ? fromApi : fallback,
  );
};
