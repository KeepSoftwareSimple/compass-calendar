import { type SyncConfig } from "@sync/config/sync.config";
import { AppleAuthAdapter } from "@sync/providers/apple/apple-auth.adapter";
import { AppleCalendarAdapter } from "@sync/providers/apple/apple-calendar.adapter";
import { AppleEventReaderAdapter } from "@sync/providers/apple/apple-event-reader.adapter";
import {
  AppleEventWriter,
  createDefaultAppleEventWriterApi,
} from "@sync/providers/apple/apple-event-writer.adapter";
import { AppleNotificationAdapter } from "@sync/providers/apple/apple-notifications.adapter";
import {
  type ProviderAdapters,
  ProviderNotConfiguredError,
} from "@sync/providers/provider-adapters";

function appleConfigured(config: SyncConfig): boolean {
  return Boolean(config.CREDENTIAL_ENCRYPTION_KEY);
}

function appleUsername(account: {
  email: string | null;
  providerAccountId?: string;
}): string {
  const email = account.email?.trim();
  if (email) return email;
  const providerAccountId = account.providerAccountId?.trim();
  if (providerAccountId) return providerAccountId;
  throw new ProviderNotConfiguredError("apple");
}

export function bindAppleAdaptersForConnection(
  connection: {
    account: {
      email: string | null;
      providerAccountId?: string;
    };
  },
  adapters: ProviderAdapters,
): ProviderAdapters {
  const username = appleUsername(connection.account);
  return {
    ...adapters,
    calendars: new AppleCalendarAdapter(username),
    reader: new AppleEventReaderAdapter(username),
    writer: new AppleEventWriter({
      makeApi: (accessToken) =>
        createDefaultAppleEventWriterApi(accessToken, undefined, username),
    }),
  };
}

export function appleAdapters(
  config: SyncConfig,
  override?: Partial<ProviderAdapters>,
): ProviderAdapters {
  // Tests inject partial overrides (auth/writer only) without the encryption key.
  if (!appleConfigured(config) && override?.auth === undefined) {
    throw new ProviderNotConfiguredError("apple");
  }
  return {
    auth: override?.auth ?? new AppleAuthAdapter(),
    calendars: override?.calendars ?? new AppleCalendarAdapter("unbound"),
    reader: override?.reader ?? new AppleEventReaderAdapter("unbound"),
    writer: override?.writer ?? new AppleEventWriter(),
    notifications: override?.notifications ?? new AppleNotificationAdapter(),
  };
}

export function appleProviderConfigured(config: SyncConfig): boolean {
  return appleConfigured(config);
}
