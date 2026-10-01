import { type ReactNode } from "react";
import { useDesktopResume } from "@web/desktop/useDesktopResume";
import { useEventSSE } from "../hooks/useEventSSE";
import { useSSEConnection } from "../hooks/useSSEConnection";
import { useSyncFocusRefresh } from "../hooks/useSyncFocusRefresh";
import { useSyncSSE } from "../hooks/useSyncSSE";
import { useTransientSyncPolling } from "../hooks/useTransientSyncPolling";

export * from "../client/sse.client";

const SSEProvider = ({ children }: { children: ReactNode }) => {
  useSSEConnection();
  useEventSSE();
  useSyncSSE();
  useSyncFocusRefresh();
  useDesktopResume();
  useTransientSyncPolling();

  return children;
};

export default SSEProvider;
