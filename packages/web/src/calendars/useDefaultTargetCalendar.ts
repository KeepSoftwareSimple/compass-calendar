import { useMemo } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { connectionProviderKind } from "@web/auth/providers/connection-provider.util";
import {
  getGoogleReconnectRequiredAccountEmails,
  useGoogleReconnectRequiredVersion,
} from "@web/auth/providers/reconnect.state";
import {
  selectGoogleSyncConnections,
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import {
  type AccountRef,
  accountKey,
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
  const reconnectRequiredEmails = getGoogleReconnectRequiredAccountEmails();

  return getDefaultTargetCalendar(calendars, {
    preferredCalendarId,
    accountEmailOrder,
    reconnectRequiredEmails,
  });
}

/** Connected account emails in connection order (oldest first). */
export function useConnectedAccountEmails(): string[] {
  const connections = useUserMetadataStore(selectGoogleSyncConnections);

  return useMemo(
    () =>
      connections
        .map((connection) => connection.accountEmail)
        .filter((email): email is string => Boolean(email)),
    [connections],
  );
}

/**
 * Connected accounts in connection order (oldest first), keyed by provider
 * + email. Use this wherever an account becomes a React key, DOM id, or
 * label: two providers can share one address, and only the key tells them
 * apart. `useConnectedAccountEmails` stays for ordering by email.
 */
export function useConnectedAccounts(): AccountRef[] {
  const connections = useUserMetadataStore(selectSyncConnections);

  return useMemo(
    () =>
      connections.flatMap((connection) => {
        const { accountEmail } = connection;
        if (!accountEmail) return [];
        const provider = connectionProviderKind(connection);
        return [
          { key: accountKey(provider, accountEmail), provider, accountEmail },
        ];
      }),
    [connections],
  );
}
