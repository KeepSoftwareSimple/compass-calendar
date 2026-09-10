import {
  type ProviderKind,
  ProviderKindSchema,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import {
  GOOGLE_CONNECT_FAILED_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { getToast } from "@web/common/utils/toast/toast.port";

export type ConnectStatus =
  | "connected"
  | "declined"
  | "missingScopes"
  | "error";

export type ConnectRedirect = {
  provider: ProviderKind;
  status: ConnectStatus;
};

const STATUS_VALUES: readonly ConnectStatus[] = [
  "connected",
  "declined",
  "missingScopes",
  "error",
];

const SUCCESS_TOAST_ID: Record<ProviderKind, string> = {
  google: "google-connect-success",
  microsoft: "connect-success",
  apple: "connect-success",
};

const DECLINED_TOAST_ID: Record<ProviderKind, string> = {
  google: "google-connect-declined",
  microsoft: "connect-declined",
  apple: "connect-declined",
};

const MISSING_SCOPES_TOAST_ID: Record<ProviderKind, string> = {
  google: "google-connect-missing-scopes",
  microsoft: "connect-missing-scopes",
  apple: "connect-missing-scopes",
};

const CONNECTED_COPY: Record<ProviderKind, string> = {
  google: "Google Calendar connected.",
  microsoft: "Microsoft connected.",
  apple: "Apple connected.",
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

export function refreshUserMetadataAfterConnect(status: ConnectStatus): void {
  if (status !== "connected") return;
  void refreshUserMetadata({ force: true });
}

function connectedCopy(provider: ProviderKind): string {
  return CONNECTED_COPY[provider];
}

function errorCopy(provider: ProviderKind): string {
  const name = providerDisplayName(provider);
  return `We couldn't connect your ${name} account. Please try again from Settings.`;
}

function fireConnectStatusToast({ provider, status }: ConnectRedirect): void {
  const toast = getToast();
  switch (status) {
    case "connected":
      track("calendar_connected", { source: "connect_redirect", provider });
      trackSignupStep("calendar_connected", { method: provider });
      toast.success(connectedCopy(provider), {
        ...getToastDefaultOptions(),
        toastId: SUCCESS_TOAST_ID[provider],
      });
      return;
    case "declined":
      toast.info(
        "No problem - nothing was connected. You can add the account anytime from Settings.",
        { ...getToastDefaultOptions(), toastId: DECLINED_TOAST_ID[provider] },
      );
      return;
    case "missingScopes":
      toast.error(
        "Compass needs calendar permission to sync. Reconnect from Settings and leave the calendar box checked.",
        {
          ...getToastDefaultOptions(),
          autoClose: false,
          toastId: MISSING_SCOPES_TOAST_ID[provider],
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
