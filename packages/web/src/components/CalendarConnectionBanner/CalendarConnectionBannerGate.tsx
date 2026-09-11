import { type FC } from "react";
import { pickCalendarBannerTarget } from "@web/auth/providers/connect.util";
import { connectionProviderKind } from "@web/auth/providers/connection-provider.util";
import { useGoogleReconnectRequiredVersion } from "@web/auth/providers/reconnect.state";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { CalendarConnectionBanner } from "@web/components/CalendarConnectionBanner/CalendarConnectionBanner";

export const CalendarConnectionBannerGate: FC = () => {
  const connections = useUserMetadataStore(selectSyncConnections);
  useGoogleReconnectRequiredVersion();
  const target = pickCalendarBannerTarget(connections);
  const provider = connectionProviderKind(target?.connection);
  const { connect, refresh } = useConnectProvider(
    provider,
    target?.connection ? { connection: target.connection } : undefined,
  );
  if (!target) return null;

  return (
    <CalendarConnectionBanner
      kind={target.kind}
      onAction={target.kind === "reconnect" ? connect : () => refresh()}
      provider={provider}
      accountEmail={target.connection.accountEmail}
    />
  );
};
