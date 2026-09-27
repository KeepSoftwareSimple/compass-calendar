import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { UserProvider } from "@web/auth/compass/user/context/UserProvider";
import { isMobileOS } from "@web/common/utils/device/device.util";
import { isSearchFlagOn } from "@web/common/utils/parse/search-flag.util";
import { AuthenticatedLayout } from "@web/components/AuthenticatedLayout/AuthenticatedLayout";
import { type AuthSearch } from "@web/components/AuthModal/hooks/useAuthModal";
import { GlobalShortcutsHost } from "@web/components/CompassProvider/CompassProvider";
import { DocumentTitle } from "@web/components/DocumentTitle/DocumentTitle";
import { MobileGate } from "@web/components/MobileGate/MobileGate";
import {
  createInitialMobileGameState,
  skipToEnd,
} from "@web/components/MobileGate/mobile-game.state";
import { UpNextBanner } from "@web/components/Sidebar/UpNextCard/UpNextBanner";
import SSEProvider from "@web/sse/provider/SSEProvider";

export const RootView = () => {
  // Gate on the device OS, not the window width: narrow desktop windows get
  // the responsive layout. Static per session, so no listener is needed.
  const isMobile = useMemo(() => isMobileOS(), []);
  const search = useSearch({ strict: false }) as AuthSearch;

  if (isMobile) {
    // A phone visitor who tapped "Set up your own meeting page" on a public
    // /meet page skips the game and lands on the desktop handoff. The flag
    // stays in the URL (useGuestMeetingSetupEntry leaves it alone on phones),
    // so "Copy link for desktop" opens the wizard on a computer.
    const skipToHandoff = isSearchFlagOn(search.meetingSetup);
    return (
      <MobileGate
        initialState={
          skipToHandoff ? skipToEnd(createInitialMobileGameState()) : undefined
        }
      />
    );
  }

  return (
    <UserProvider>
      <SSEProvider>
        <GlobalShortcutsHost />
        <DocumentTitle />
        <UpNextBanner />
        <AuthenticatedLayout />
      </SSEProvider>
    </UserProvider>
  );
};
