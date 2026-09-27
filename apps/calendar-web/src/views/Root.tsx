import { useMemo } from "react";
import { UserProvider } from "@web/auth/compass/user/context/UserProvider";
import { isMobileOS } from "@web/common/utils/device/device.util";
import { AuthenticatedLayout } from "@web/components/AuthenticatedLayout/AuthenticatedLayout";
import { GlobalShortcutsHost } from "@web/components/CompassProvider/CompassProvider";
import { DocumentTitle } from "@web/components/DocumentTitle/DocumentTitle";
import { MobileGate } from "@web/components/MobileGate/MobileGate";
import { UpNextBanner } from "@web/components/Sidebar/UpNextCard/UpNextBanner";
import SSEProvider from "@web/sse/provider/SSEProvider";

export const RootView = () => {
  // Gate on the device OS, not the window width: narrow desktop windows get
  // the responsive layout. Static per session, so no listener is needed.
  const isMobile = useMemo(() => isMobileOS(), []);

  if (isMobile) {
    return <MobileGate />;
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
