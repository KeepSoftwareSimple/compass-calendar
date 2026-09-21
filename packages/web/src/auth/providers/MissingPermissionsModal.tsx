import { CheckIcon } from "@phosphor-icons/react";
import { type FC, useEffect } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { useSession } from "@web/auth/compass/session/useSession";
import { trackSignupStep } from "@web/auth/posthog/signup-funnel";
import {
  missingPermissionsActions,
  selectMissingPermissionsProvider,
  useMissingPermissionsStore,
} from "@web/auth/providers/missing-permissions.store";
import {
  CONNECT_CALENDAR_REASSURANCE,
  MISSING_PERMISSIONS_INTRO,
  MISSING_PERMISSIONS_NOT_NOW_LABEL,
  MISSING_PERMISSIONS_TITLE,
  missingPermissionsRetryLabel,
  REQUESTED_PERMISSIONS,
} from "@web/auth/providers/provider-copy.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import { useSignInProviders } from "@web/auth/providers/useSignInProviders";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { useAppLockReason } from "@web/shortcuts/app-lock";

export const MissingPermissionsModal: FC = () => {
  const provider = useMissingPermissionsStore(selectMissingPermissionsProvider);
  const { authenticated } = useSession();
  const isOpen = provider !== null;
  useAppLockReason("missingPermissionsModal", isOpen);

  // Reopens the provider's consent screen with every permission checked, the
  // same way a stale-refresh-token retry does after signup.
  const signIn = useSignInProviders({ google: { prompt: "consent" } });
  const google = useConnectProvider("google");
  const microsoft = useConnectProvider("microsoft");
  const apple = useConnectProvider("apple");
  const byKind: Record<ProviderKind, ReturnType<typeof useConnectProvider>> = {
    google,
    microsoft,
    apple,
  };

  useEffect(() => {
    if (!provider) return;
    trackSignupStep("permissions_explainer_shown", { method: provider });
  }, [provider]);

  if (!provider) return null;

  const permissions = REQUESTED_PERMISSIONS[provider];

  const handleRetry = () => {
    missingPermissionsActions.close();
    if (authenticated) {
      byKind[provider].connect();
      return;
    }
    signIn.startSignIn(provider);
  };

  return (
    <OverlayPanel
      onDismiss={missingPermissionsActions.close}
      title={MISSING_PERMISSIONS_TITLE}
      variant="modal"
      widthClassName="w-120"
    >
      <div className="flex w-full flex-col gap-6 text-sm text-text">
        <p className="text-text-muted">{MISSING_PERMISSIONS_INTRO[provider]}</p>
        <ul className="flex w-full flex-col gap-3">
          {permissions.map((permission) => (
            <li className="flex items-start gap-2" key={permission.name}>
              <CheckIcon
                aria-hidden
                className="mt-0.5 shrink-0 text-accent"
                size={16}
                weight="bold"
              />
              <span>
                <span className="font-medium text-text">{permission.name}</span>
                <span className="block text-text-muted">{permission.why}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-text-muted text-xs">
          {CONNECT_CALENDAR_REASSURANCE}
        </p>
      </div>
      <OverlayPanelActions>
        <OverlayPanelActionButton onClick={missingPermissionsActions.close}>
          {MISSING_PERMISSIONS_NOT_NOW_LABEL}
        </OverlayPanelActionButton>
        <OverlayPanelActionButton onClick={handleRetry} variant="primary">
          {missingPermissionsRetryLabel(provider)}
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
};
