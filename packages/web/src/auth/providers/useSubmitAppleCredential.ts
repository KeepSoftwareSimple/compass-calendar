import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Status } from "@core/errors/status.codes";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { AuthApi } from "@web/api/auth.api";
import { getApiErrorMessage, getErrorStatus } from "@web/api/util/api.util";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import {
  APPLE_CREDENTIAL_INVALID_MESSAGE,
  APPLE_CREDENTIAL_RATE_LIMIT_MESSAGE,
} from "@web/auth/providers/connect-apple.copy";
import { connectAppleActions } from "@web/auth/providers/connect-apple.store";
import {
  GOOGLE_CONNECT_FAILED_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { getToast } from "@web/common/utils/toast/toast.port";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";

const SUCCESS_TOAST_ID = "connect-success";

function connectedCopy(): string {
  return "Apple connected.";
}

export function finishCredentialConnect(provider: ProviderKind): void {
  track("calendar_connected", { source: "credential_form", provider });
  trackSignupStep("calendar_connected", { method: provider });
  getToast().success(connectedCopy(), {
    ...getToastDefaultOptions(),
    toastId: SUCCESS_TOAST_ID,
  });
  void refreshUserMetadata({ force: true });
}

export function useSubmitAppleCredential() {
  const queryClient = useQueryClient();

  return useCallback(
    async (username: string, secret: string) => {
      try {
        await AuthApi.connectAppleCredential({ username, secret });
        connectAppleActions.close();
        finishCredentialConnect("apple");
        await queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
      } catch (error) {
        const status = getErrorStatus(error);
        if (status === Status.TOO_MANY_REQUESTS) {
          throw new Error(APPLE_CREDENTIAL_RATE_LIMIT_MESSAGE);
        }
        const message = getApiErrorMessage(error);
        if (
          status === Status.BAD_REQUEST &&
          message === APPLE_CREDENTIAL_INVALID_MESSAGE
        ) {
          throw new Error(APPLE_CREDENTIAL_INVALID_MESSAGE);
        }
        showErrorToast(
          "We couldn't connect your Apple Calendar. Please try again.",
          { toastId: GOOGLE_CONNECT_FAILED_TOAST_ID },
        );
        throw error;
      }
    },
    [queryClient],
  );
}
