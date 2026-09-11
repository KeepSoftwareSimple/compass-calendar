import { useMemo } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  getReconnectRequiredAccountKeys,
  useGoogleReconnectRequiredVersion,
} from "@web/auth/providers/reconnect.state";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import {
  type AccountRef,
  connectionAccount,
  getDefaultTargetCalendar,
} from "@web/calendars/calendar.util";
import { useDefaultCalendarId } from "@web/calendars/default-calendar.store";

/**
 * The calendar a new event should land on: the user's chosen default when
 * it is still usable, else the primary calendar of the oldest-connected
 * account, else the local calendar while disconnected.
 *
 * Wraps getDefaultTargetCalendar with the two reactive inputs every caller
 * needs - the stored preference and the connected accounts in connection
 * order - so a change to either re-renders the caller.
 */
export function useDefaultTargetCalendar(
  calendars: Calendar[],
): Calendar | undefined {
  const preferredCalendarId = useDefaultCalendarId();
  const accountEmailOrder = useConnectedAccountEmails();
  useGoogleReconnectRequiredVersion();
  const reconnectRequiredEmails = getReconnectRequiredAccountKeys();

  return getDefaultTargetCalendar(calendars, {
    preferredCalendarId,
    accountEmailOrder,
    reconnectRequiredEmails,
  });
}

/** Connected accounts in connection order (oldest first). */
export function useConnectedAccounts(): AccountRef[] {
  const connections = useUserMetadataStore(selectSyncConnections);

  return useMemo(
    () =>
      connections.flatMap((connection) => connectionAccount(connection) ?? []),
    [connections],
  );
}

/** The same accounts as emails, for callers that only order calendars by account. */
export function useConnectedAccountEmails(): string[] {
  const accounts = useConnectedAccounts();

  return useMemo(
    () => accounts.map((account) => account.accountEmail),
    [accounts],
  );
}
