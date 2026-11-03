import { createContext, type PropsWithChildren, useContext } from "react";
import { useAppUpdateAvailableNotice } from "@web/components/Sidebar/SidebarActions/useAppUpdateAvailableNotice";
import {
  useVersionCheck,
  type VersionCheckResult,
} from "@web/components/Sidebar/SidebarActions/useVersionCheck";

const AppVersionCheckContext = createContext<VersionCheckResult | null>(null);

/** Polls `/version.json` once for the whole app and surfaces the update toast. */
export function AppVersionCheckProvider({ children }: PropsWithChildren) {
  const value = useVersionCheck();
  useAppUpdateAvailableNotice(value.isUpdateAvailable, value.availableVersion);

  return (
    <AppVersionCheckContext.Provider value={value}>
      {children}
    </AppVersionCheckContext.Provider>
  );
}

export function useSharedAppVersionCheck(): VersionCheckResult {
  const value = useContext(AppVersionCheckContext);
  if (!value) {
    throw new Error(
      "useSharedAppVersionCheck must be used within AppVersionCheckProvider",
    );
  }
  return value;
}
