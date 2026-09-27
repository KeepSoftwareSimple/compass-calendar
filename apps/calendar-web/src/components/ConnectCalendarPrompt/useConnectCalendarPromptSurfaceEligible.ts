import { useContext } from "react";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  selectConnectAppleOpen,
  useConnectAppleStore,
} from "@web/auth/providers/connect-apple.store";
import {
  selectMissingPermissionsProvider,
  useMissingPermissionsStore,
} from "@web/auth/providers/missing-permissions.store";
import { useAvailableConnectProviders } from "@web/auth/providers/useAvailableConnectProviders";
import {
  selectSyncConnections,
  selectUserMetadataStatus,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  selectConnectCalendarPromptSnoozed,
  selectConnectCalendarPromptSurfaceEligible,
  useConnectCalendarPromptStore,
} from "@web/components/ConnectCalendarPrompt/connect-calendar.store";
import {
  selectIsAboutOpen,
  selectIsSettingsOpen,
  useSettingsStore,
} from "@web/settings/settings.store";

/**
 * Shared eligibility read for RootShell (slot) and the gate (unmount while
 * Settings/auth chrome is open). `isAuthModalOpen` is passed in because
 * RootShell lives outside AuthModalProvider and reads the URL param, while
 * the gate reads the provider context.
 */
export function useConnectCalendarPromptSurfaceEligible(
  isAuthModalOpen: boolean,
): boolean {
  const { authenticated } = useContext(SessionContext);
  const connections = useUserMetadataStore(selectSyncConnections);
  const metadataStatus = useUserMetadataStore(selectUserMetadataStatus);
  const isSnoozed = useConnectCalendarPromptStore(
    selectConnectCalendarPromptSnoozed,
  );
  const availableProviders = useAvailableConnectProviders();
  const isSettingsOpen = useSettingsStore(selectIsSettingsOpen);
  const isAboutOpen = useSettingsStore(selectIsAboutOpen);
  const isAppleFormOpen = useConnectAppleStore(selectConnectAppleOpen);
  const isMissingPermissionsOpen =
    useMissingPermissionsStore(selectMissingPermissionsProvider) !== null;

  return selectConnectCalendarPromptSurfaceEligible({
    authenticated,
    metadataStatus,
    connectionCount: connections.length,
    isSnoozed,
    availableProviderCount: availableProviders.length,
    storageAvailable: persistentBrowserStore.isAvailable(),
    isAuthModalOpen,
    isSettingsOpen,
    isAboutOpen,
    isAppleFormOpen,
    isMissingPermissionsOpen,
  });
}
