import { type FC } from "react";
import { getCalendarConnectionBannerKind } from "@web/auth/google/hooks/useConnectGoogle/useConnectGoogle.util";
import { connectionProvider } from "@web/auth/providers/provider-copy.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import {
  selectPrimarySyncConnection,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { CalendarConnectionBanner } from "@web/components/CalendarConnectionBanner/CalendarConnectionBanner";

export const CalendarConnectionBannerGate: FC = () => {
  const primary = useUserMetadataStore(selectPrimarySyncConnection);
  const kind = connectionProvider(primary);
  const { connect, connection, refresh, state } = useConnectProvider(kind, {
    connection: primary,
  });
  const bannerKind = getCalendarConnectionBannerKind(state, connection);
  if (!bannerKind) return null;

  return (
    <CalendarConnectionBanner
      kind={bannerKind}
      onAction={bannerKind === "reconnect" ? connect : () => refresh()}
      provider={connectionProvider(connection)}
    />
  );
};
