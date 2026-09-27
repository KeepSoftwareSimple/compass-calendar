import { type Calendar } from "@core/types/calendar.contracts";
import { calendarProviderKind } from "@web/auth/providers/connection-provider.util";
import { connectionProvider } from "@web/auth/providers/provider-copy.util";
import {
  isAccountReconnectRequired,
  isConnectionReconnectRequired,
} from "@web/auth/providers/reconnect.state";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";

/**
 * True when this calendar's provider account needs reconnect, whether the
 * session override was keyed by email+provider or by connection id.
 */
export function isCalendarReconnectRequired(
  calendar: Pick<Calendar, "accountEmail" | "provider"> | null | undefined,
): boolean {
  if (!calendar?.accountEmail) return false;
  const provider = calendarProviderKind(calendar);
  if (provider && isAccountReconnectRequired(calendar.accountEmail, provider)) {
    return true;
  }

  const connection = selectSyncConnections(
    useUserMetadataStore.getState(),
  ).find(
    (entry) =>
      entry.accountEmail === calendar.accountEmail &&
      (!provider || connectionProvider(entry) === provider),
  );
  return isConnectionReconnectRequired(connection?.id);
}
