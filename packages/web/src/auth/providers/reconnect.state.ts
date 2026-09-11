/**
 * Session-scoped reconnect-required overrides for connected accounts.
 *
 * Sync metadata can lag behind a live `410 GOOGLE_REVOKED` (or briefly report
 * healthy/catchingUp while credentials are already dead). This store keeps a
 * durable per-connection truth so toast, sidebar, Settings, and write gates stay
 * congruent until metadata catches up or the user reconnects.
 *
 * Email matches only with a provider: the same address can back both a Google
 * and a Microsoft connection, and one broken grant must not pin the other.
 */

import { useSyncExternalStore } from "react";
import {
  type ProviderKind,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";

export type GoogleReconnectTarget = {
  connectionId?: string | null;
  accountEmail?: string | null;
  provider?: ProviderKind | null;
};

const reconnectRequiredConnectionIds = new Set<string>();
const reconnectRequiredAccounts = new Set<string>();
const connectionProviders = new Map<string, ProviderKind>();
const listeners = new Set<() => void>();
let version = 0;

const notify = (): void => {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
};

const normalizeEmail = (email: string | null | undefined): string | null => {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const parseProvider = (
  provider: string | null | undefined,
): ProviderKind | null => {
  const parsed = ProviderKindSchema.safeParse(provider);
  return parsed.success ? parsed.data : null;
};

const connectionProvider = (
  provider: string | null | undefined,
): ProviderKind => parseProvider(provider) ?? "google";

export function reconnectAccountKey(
  provider: ProviderKind,
  email: string,
): string {
  return `${provider}:${email.trim().toLowerCase()}`;
}

const normalizeTarget = (
  target: GoogleReconnectTarget,
): {
  connectionId: string | null;
  accountEmail: string | null;
  provider: ProviderKind | null;
} => ({
  connectionId: target.connectionId?.trim() || null,
  accountEmail: normalizeEmail(target.accountEmail),
  provider: parseProvider(target.provider),
});

export function subscribeToGoogleReconnectRequired(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot key for useSyncExternalStore — changes whenever the set mutates. */
export function getGoogleReconnectRequiredVersion(): number {
  return version;
}

/**
 * Subscribe so the caller re-renders when session reconnect overrides change.
 * Pair with the imperative getters (`hasGoogleReconnectRequired`,
 * `isAccountReconnectRequired`, …) read during render.
 */
export function useGoogleReconnectRequiredVersion(): number {
  return useSyncExternalStore(
    subscribeToGoogleReconnectRequired,
    getGoogleReconnectRequiredVersion,
    getGoogleReconnectRequiredVersion,
  );
}

export function markAccountReconnectRequired(
  target: GoogleReconnectTarget,
): void {
  const { connectionId, accountEmail, provider } = normalizeTarget(target);
  if (!connectionId && !(accountEmail && provider)) return;

  let changed = false;
  if (connectionId && !reconnectRequiredConnectionIds.has(connectionId)) {
    reconnectRequiredConnectionIds.add(connectionId);
    changed = true;
  }
  if (connectionId && provider) {
    if (connectionProviders.get(connectionId) !== provider) {
      connectionProviders.set(connectionId, provider);
      changed = true;
    }
  }
  if (accountEmail && provider) {
    const key = reconnectAccountKey(provider, accountEmail);
    if (!reconnectRequiredAccounts.has(key)) {
      reconnectRequiredAccounts.add(key);
      changed = true;
    }
  }
  if (changed) notify();
}

export function clearAccountReconnectRequired(
  target: GoogleReconnectTarget,
): void {
  const { connectionId, accountEmail, provider } = normalizeTarget(target);
  let changed = false;
  if (connectionId && reconnectRequiredConnectionIds.delete(connectionId)) {
    connectionProviders.delete(connectionId);
    changed = true;
  }
  if (accountEmail && provider) {
    if (
      reconnectRequiredAccounts.delete(
        reconnectAccountKey(provider, accountEmail),
      )
    ) {
      changed = true;
    }
  }
  if (changed) notify();
}

export function clearAllGoogleReconnectRequired(): void {
  if (
    reconnectRequiredConnectionIds.size === 0 &&
    reconnectRequiredAccounts.size === 0
  ) {
    return;
  }
  reconnectRequiredConnectionIds.clear();
  reconnectRequiredAccounts.clear();
  connectionProviders.clear();
  notify();
}

/**
 * Align session overrides with the latest metadata connections:
 * - add every metadata `RECONNECT_REQUIRED` row
 * - drop overrides only when the connection/account disappears (disconnect)
 *
 * Do **not** clear an override just because metadata still reports healthy /
 * catchingUp — that lag is exactly why the session override exists after a
 * live `410 GOOGLE_REVOKED`. A confirmed OAuth `connected` round-trip clears
 * the rows that completed; Disconnect removes the connection row.
 */
export function syncReconnectRequiredFromConnections(
  connections: ReadonlyArray<{
    id: string;
    accountEmail: string | null;
    connectionState: string;
    provider?: string | null;
  }>,
): void {
  const presentIds = new Set(connections.map((connection) => connection.id));
  const presentKeys = new Set<string>();
  for (const connection of connections) {
    const email = normalizeEmail(connection.accountEmail);
    if (!email) continue;
    presentKeys.add(
      reconnectAccountKey(connectionProvider(connection.provider), email),
    );
  }
  let changed = false;

  for (const connection of connections) {
    if (connection.connectionState !== "RECONNECT_REQUIRED") continue;
    const provider = connectionProvider(connection.provider);

    if (!reconnectRequiredConnectionIds.has(connection.id)) {
      reconnectRequiredConnectionIds.add(connection.id);
      changed = true;
    }
    if (connectionProviders.get(connection.id) !== provider) {
      connectionProviders.set(connection.id, provider);
      changed = true;
    }
    const email = normalizeEmail(connection.accountEmail);
    if (email) {
      const key = reconnectAccountKey(provider, email);
      if (!reconnectRequiredAccounts.has(key)) {
        reconnectRequiredAccounts.add(key);
        changed = true;
      }
    }
  }

  for (const connectionId of [...reconnectRequiredConnectionIds]) {
    if (!presentIds.has(connectionId)) {
      reconnectRequiredConnectionIds.delete(connectionId);
      connectionProviders.delete(connectionId);
      changed = true;
    }
  }

  for (const key of [...reconnectRequiredAccounts]) {
    if (!presentKeys.has(key)) {
      reconnectRequiredAccounts.delete(key);
      changed = true;
    }
  }

  if (changed) notify();
}

export function isConnectionReconnectRequired(
  connectionId: string | null | undefined,
): boolean {
  const id = connectionId?.trim();
  return Boolean(id && reconnectRequiredConnectionIds.has(id));
}

export function isAccountReconnectRequired(
  accountEmail: string | null | undefined,
  provider?: ProviderKind | null,
): boolean {
  const email = normalizeEmail(accountEmail);
  const kind = parseProvider(provider);
  if (!email || !kind) return false;
  return reconnectRequiredAccounts.has(reconnectAccountKey(kind, email));
}

/** True when any Google connection or Google email+provider pair needs reconnect. */
export function hasGoogleReconnectRequired(): boolean {
  return hasProviderReconnectRequired("google");
}

export function hasProviderReconnectRequired(provider: ProviderKind): boolean {
  for (const key of reconnectRequiredAccounts) {
    if (key.startsWith(`${provider}:`)) return true;
  }
  for (const [connectionId, kind] of connectionProviders) {
    if (kind === provider && reconnectRequiredConnectionIds.has(connectionId)) {
      return true;
    }
  }
  return false;
}

export function hasAnyReconnectRequired(): boolean {
  return (
    reconnectRequiredConnectionIds.size > 0 ||
    reconnectRequiredAccounts.size > 0
  );
}

/** `provider:email` keys for every session override that named an account. */
export function getReconnectRequiredAccountKeys(): ReadonlySet<string> {
  return reconnectRequiredAccounts;
}

/** @deprecated Prefer {@link getReconnectRequiredAccountKeys}. Google emails only. */
export function getGoogleReconnectRequiredAccountEmails(): ReadonlySet<string> {
  const emails = new Set<string>();
  for (const key of reconnectRequiredAccounts) {
    if (!key.startsWith("google:")) continue;
    emails.add(key.slice("google:".length));
  }
  return emails;
}

/** Test-only reset. */
export function resetGoogleReconnectRequiredForTests(): void {
  reconnectRequiredConnectionIds.clear();
  reconnectRequiredAccounts.clear();
  connectionProviders.clear();
  version = 0;
}
