import { isBackendUnavailableError } from "@web/api/util/backend-unavailable-error.util";

export function getAuthSubmitErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (error instanceof Error) {
    if (isBackendUnavailableError(error)) {
      return "We can't reach Compass right now. Please check your connection and try again.";
    }

    return error.message;
  }

  return fallbackMessage;
}
