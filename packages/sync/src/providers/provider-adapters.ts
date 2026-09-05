import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { type ProviderAuthAdapter } from "@sync/providers/provider-auth.port";
import { type ProviderCalendarAdapter } from "@sync/providers/provider-calendar.port";
import { type ContactsPort } from "@sync/providers/provider-contacts.port";
import { type ProviderEventReader } from "@sync/providers/provider-event-reader.port";
import { type ProviderEventWriter } from "@sync/providers/provider-event-writer.port";
import { type ProviderNotificationAdapter } from "@sync/providers/provider-notifications.port";

export interface ProviderAdapters {
  auth: ProviderAuthAdapter;
  calendars: ProviderCalendarAdapter;
  reader: ProviderEventReader;
  writer: ProviderEventWriter;
  notifications: ProviderNotificationAdapter;
  contacts?: ContactsPort;
}

export type ResolveProviderAdapters = (
  provider: ProviderKind,
  connection?: {
    account: {
      email: string | null;
      providerAccountId?: string;
    };
  },
) => ProviderAdapters;

export type ResolveProviderAuth = (
  provider: ProviderKind,
) => ProviderAuthAdapter;

export class ProviderNotConfiguredError extends Error {
  readonly provider: ProviderKind;

  constructor(provider: ProviderKind) {
    super(`Provider ${provider} is not configured`);
    this.name = "ProviderNotConfiguredError";
    this.provider = provider;
  }
}
