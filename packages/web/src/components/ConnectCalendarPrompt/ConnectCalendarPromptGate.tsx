import { type FC, useContext } from "react";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  selectConnectAppleOpen,
  useConnectAppleStore,
} from "@web/auth/providers/connect-apple.store";
import { useAvailableConnectProviders } from "@web/auth/providers/useAvailableConnectProviders";
import {
  selectSyncConnections,
  selectUserMetadataStatus,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import { ConnectCalendarPrompt } from "@web/components/ConnectCalendarPrompt/ConnectCalendarPrompt";
import {
  selectConnectCalendarPromptSnoozed,
  useConnectCalendarPromptStore,
} from "@web/components/ConnectCalendarPrompt/connect-calendar.store";
import {
  selectIsAboutOpen,
  selectIsSettingsOpen,
  useSettingsStore,
} from "@web/settings/settings.store";

export const ConnectCalendarPromptGate: FC = () => {
  const { authenticated } = useContext(SessionContext);
  const { isOpen: isAuthModalOpen } = useContext(AuthModalContext);
  const connections = useUserMetadataStore(selectSyncConnections);
  const metadataStatus = useUserMetadataStore(selectUserMetadataStatus);
  const isSnoozed = useConnectCalendarPromptStore(
    selectConnectCalendarPromptSnoozed,
  );
  const availableProviders = useAvailableConnectProviders();
  const isSettingsOpen = useSettingsStore(selectIsSettingsOpen);
  const isAboutOpen = useSettingsStore(selectIsAboutOpen);
  const isAppleFormOpen = useConnectAppleStore(selectConnectAppleOpen);

  const isLive =
    authenticated &&
    metadataStatus === "loaded" &&
    connections.length === 0 &&
    !isSnoozed &&
    availableProviders.length > 0 &&
    persistentBrowserStore.isAvailable() &&
    !isAuthModalOpen &&
    !isSettingsOpen &&
    !isAboutOpen &&
    !isAppleFormOpen;

  if (!isLive) return null;

  return <ConnectCalendarPrompt />;
};
