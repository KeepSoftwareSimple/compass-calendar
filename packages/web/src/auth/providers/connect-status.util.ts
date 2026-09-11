import {
  type ProviderKind,
  ProviderKindSchema,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import {
  type SignupFailureReason,
  trackSignupFailed,
  trackSignupStep,
} from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { connectionProviderKind } from "@web/auth/providers/connection-provider.util";
import { CONSENT_REQUIRED_COPY } from "@web/auth/providers/provider-copy.util";
import { clearAccountReconnectRequired } from "@web/auth/providers/reconnect.state";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import {
  GOOGLE_CONNECT_FAILED_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { dismissGoogleReconnectToastIfRecovered } from "@web/common/utils/toast/google-reconnect.toast";
import { getToast } from "@web/common/utils/toast/toast.port";

/**
 * Must stay in step with every status the sync callback can redirect with
 * (`packages/sync/src/server/connection.routes.ts`). A status missing here
 * makes `readConnectStatus` return null, which means the user lands on the
 * calendar after a failed connect with no explanation at all.
 */
export type ConnectStatus =
  | "connected"
  | "declined"
  | "missingScopes"
  | "stateMismatch"
  | "consentRequired"
  | "accountMismatch"
  | "error";

export type ConnectRedirect = {
  provider: ProviderKind;
  status: ConnectStatus;
};

const STATUS_VALUES: readonly ConnectStatus[] = [
  "connected",
  "declined",
  "missingScopes",
  "stateMismatch",
  "consentRequired",
  "accountMismatch",
  "error",
];

const DECLINED_TOAST_ID: Record<ProviderKind, string> = {
  google: "google-connect-declined",
  microsoft: "connect-declined",
  apple: "connect-declined",
};

const STATE_MISMATCH_TOAST_ID = "connect-state-mismatch";
const CONSENT_REQUIRED_TOAST_ID = "connect-consent-required";
const ACCOUNT_MISMATCH_TOAST_ID = "connect-account-mismatch";

const FAILURE_REASON: Record<
  Exclude<ConnectStatus, "connected">,
  SignupFailureReason
> = {
  declined: "connect_declined",
  missingScopes: "connect_missing_scopes",
  stateMismatch: "connect_state_mismatch",
  consentRequired: "connect_consent_required",
  accountMismatch: "connect_account_mismatch",
  error: "connect_error",
};

const MISSING_SCOPES_TOAST_ID: Record<ProviderKind, string> = {
  google: "google-connect-missing-scopes",
  microsoft: "connect-missing-scopes",
  apple: "connect-missing-scopes",
};

export function readConnectStatus(
  search = window.location.search,
): ConnectRedirect | null {
  const params = new URLSearchParams(search);
  const providerResult = ProviderKindSchema.safeParse(params.get("provider"));
  if (!providerResult.success) return null;
  const status = params.get("status");
  if (!(STATUS_VALUES as readonly string[]).includes(status ?? "")) return null;
  return {
    provider: providerResult.data,
    status: status as ConnectStatus,
  };
}

export function showConnectStatusToast(redirect: ConnectRedirect): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fireConnectStatusToast(redirect));
  });
}

/**
 * Refresh metadata for every OAuth return, then toast from confirmed state.
 * A `connected` redirect never claims success while that provider still has a
 * reconnect-required row, and does not toast when import/health already
 * covers it.
 */
export async function applyConnectRedirect(
  redirect: ConnectRedirect,
): Promise<void> {
  await refreshUserMetadata({ force: true });
  if (redirect.status === "connected") {
    clearReconnectOverrideForProvider(redirect.provider);
    dismissGoogleReconnectToastIfRecovered(
      selectSyncConnections(useUserMetadataStore.getState()),
    );
    track("calendar_connected", {
      source: "connect_redirect",
      provider: redirect.provider,
    });
    trackSignupStep("calendar_connected", { method: redirect.provider });
    return;
  }
  showConnectStatusToast(redirect);
}

export function refreshUserMetadataAfterConnect(_status?: ConnectStatus): void {
  void refreshUserMetadata({ force: true });
}

function clearReconnectOverrideForProvider(provider: ProviderKind): void {
  const connections = selectSyncConnections(useUserMetadataStore.getState());
  for (const connection of connections) {
    if (connectionProviderKind(connection) !== provider) continue;
    if (connection.connectionState === "RECONNECT_REQUIRED") continue;
    clearAccountReconnectRequired({
      connectionId: connection.id,
      accountEmail: connection.accountEmail,
      provider: connectionProviderKind(connection),
    });
  }
}

function errorCopy(provider: ProviderKind): string {
  const name = providerDisplayName(provider);
  return `We couldn't connect your ${name} account. Please try again.`;
}

function fireConnectStatusToast({ provider, status }: ConnectRedirect): void {
  const toast = getToast();
  if (status !== "connected") {
    trackSignupFailed(FAILURE_REASON[status], {
      method: provider,
      step: "calendar_connected",
    });
  }
  switch (status) {
    case "connected":
      return;
    case "declined":
      toast.info(
        "No problem - nothing was connected. You can add the account anytime from Settings.",
        { ...getToastDefaultOptions(), toastId: DECLINED_TOAST_ID[provider] },
      );
      return;
    case "missingScopes":
      toast.error(
        "Compass needs calendar permission to sync. Reconnect and leave the calendar box checked.",
        {
          ...getToastDefaultOptions(),
          autoClose: false,
          toastId: MISSING_SCOPES_TOAST_ID[provider],
        },
      );
      return;
    case "stateMismatch":
      toast.error(
        "That connection link expired. Please try connecting again.",
        {
          ...getToastDefaultOptions(),
          autoClose: false,
          toastId: STATE_MISMATCH_TOAST_ID,
        },
      );
      return;
    case "consentRequired":
      toast.error(CONSENT_REQUIRED_COPY, {
        ...getToastDefaultOptions(),
        autoClose: false,
        toastId: CONSENT_REQUIRED_TOAST_ID,
      });
      return;
    case "accountMismatch":
      toast.error(
        "That wasn't the same account. Reconnect again and pick the account Compass already has.",
        {
          ...getToastDefaultOptions(),
          autoClose: false,
          toastId: ACCOUNT_MISMATCH_TOAST_ID,
        },
      );
      return;
    case "error":
      toast.error(errorCopy(provider), {
        ...getToastDefaultOptions(),
        autoClose: false,
        toastId: GOOGLE_CONNECT_FAILED_TOAST_ID,
      });
      return;
  }
}
