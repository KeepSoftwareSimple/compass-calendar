import {
  type ProviderCapability,
  type ProviderKind,
} from "@core/types/sync/identity.contracts";
import { type SyncConfig } from "@sync/config/sync.config";
import {
  APPLE_PROVIDER_CAPABILITIES,
  appleCapabilitiesFromScopes,
  appleScopesForFeatures,
} from "@sync/providers/apple/apple-capabilities";
import {
  appleAdapters,
  appleProviderConfigured,
  bindAppleAdaptersForConnection,
} from "@sync/providers/apple/build-provider-resolvers";
import {
  googleAdapters,
  googleProviderConfigured,
  type ProviderAdapterOverrides,
} from "@sync/providers/google/build-provider-resolvers";
import { googleScopesForFeatures } from "@sync/providers/google/google.scopes";
import {
  GOOGLE_PROVIDER_CAPABILITIES,
  googleCapabilitiesFromScopes,
} from "@sync/providers/google/google-capabilities";
import {
  microsoftAdapters,
  microsoftProviderConfigured,
} from "@sync/providers/microsoft/build-provider-resolvers";
import {
  MICROSOFT_PROVIDER_CAPABILITIES,
  microsoftCapabilitiesFromScopes,
  microsoftScopesForFeatures,
} from "@sync/providers/microsoft/microsoft-scopes";
import {
  type ProviderAdapters,
  ProviderNotConfiguredError,
  type ResolveProviderAdapters,
  type ResolveProviderAuth,
} from "@sync/providers/provider-adapters";

export interface ProviderScopes {
  forFeatures(features: readonly string[]): readonly string[];
}

export interface ProviderRegistration {
  adapters: ProviderAdapters;
  scopes: ProviderScopes;
  capabilities: readonly ProviderCapability[];
  callbackPath: string;
  notificationsCallbackPath: string;
  capabilitiesFromScopes(granted: readonly string[]): ProviderCapability[];
  bindAdaptersForConnection?: (
    connection: {
      account: {
        email: string | null;
        providerAccountId?: string;
      };
    },
    adapters: ProviderAdapters,
  ) => ProviderAdapters;
}

export class ProviderRegistry {
  constructor(
    private readonly registrations: ReadonlyMap<
      ProviderKind,
      ProviderRegistration
    >,
  ) {}

  get(kind: ProviderKind): ProviderRegistration {
    const registration = this.registrations.get(kind);
    if (!registration) {
      throw new ProviderNotConfiguredError(kind);
    }
    return registration;
  }

  has(kind: ProviderKind): boolean {
    return this.registrations.has(kind);
  }

  kinds(): ProviderKind[] {
    return [...this.registrations.keys()];
  }

  callbackUrlFor(baseUrl: string, kind: ProviderKind): string {
    return `${baseUrl}${this.get(kind).notificationsCallbackPath}`;
  }
}

export const GOOGLE_CALLBACK_PATH = "/sync/google";
export const GOOGLE_NOTIFICATIONS_PATH = "/sync/notifications/google";
export const MICROSOFT_CALLBACK_PATH = "/sync/microsoft";
export const MICROSOFT_NOTIFICATIONS_PATH = "/sync/notifications/microsoft";
export const APPLE_CALLBACK_PATH = "/sync/apple";
export const APPLE_NOTIFICATIONS_PATH = "/sync/notifications/apple";
export const OAUTH_CALLBACK_PARAM_PATH = "/sync/:provider";
export const NOTIFICATIONS_PARAM_PATH = "/sync/notifications/:provider";

export function buildProviderRegistry(
  config: SyncConfig,
  overrides: ProviderAdapterOverrides = {},
): ProviderRegistry {
  const registrations = new Map<ProviderKind, ProviderRegistration>();
  const googleOverride = overrides.google;
  if (googleProviderConfigured(config) || googleOverride?.auth !== undefined) {
    registrations.set("google", {
      adapters: googleAdapters(config, googleOverride),
      scopes: { forFeatures: googleScopesForFeatures },
      capabilities: GOOGLE_PROVIDER_CAPABILITIES,
      callbackPath: GOOGLE_CALLBACK_PATH,
      notificationsCallbackPath: GOOGLE_NOTIFICATIONS_PATH,
      capabilitiesFromScopes: googleCapabilitiesFromScopes,
    });
  }
  const microsoftOverride = overrides.microsoft;
  if (
    microsoftProviderConfigured(config) ||
    microsoftOverride?.auth !== undefined
  ) {
    registrations.set("microsoft", {
      adapters: microsoftAdapters(config, microsoftOverride),
      scopes: { forFeatures: microsoftScopesForFeatures },
      capabilities: MICROSOFT_PROVIDER_CAPABILITIES,
      callbackPath: MICROSOFT_CALLBACK_PATH,
      notificationsCallbackPath: MICROSOFT_NOTIFICATIONS_PATH,
      capabilitiesFromScopes: microsoftCapabilitiesFromScopes,
    });
  }
  const appleOverride = overrides.apple;
  if (appleProviderConfigured(config) || appleOverride?.auth !== undefined) {
    registrations.set("apple", {
      adapters: appleAdapters(config, appleOverride),
      scopes: { forFeatures: appleScopesForFeatures },
      capabilities: APPLE_PROVIDER_CAPABILITIES,
      callbackPath: APPLE_CALLBACK_PATH,
      notificationsCallbackPath: APPLE_NOTIFICATIONS_PATH,
      capabilitiesFromScopes: appleCapabilitiesFromScopes,
      bindAdaptersForConnection: bindAppleAdaptersForConnection,
    });
  }
  return new ProviderRegistry(registrations);
}

export function resolveAdaptersFrom(
  registry: ProviderRegistry,
): ResolveProviderAdapters {
  return (kind, connection) => {
    const registration = registry.get(kind);
    let adapters = registration.adapters;
    if (connection && registration.bindAdaptersForConnection) {
      adapters = registration.bindAdaptersForConnection(connection, adapters);
    }
    return adapters;
  };
}

export function resolveAuthFrom(
  registry: ProviderRegistry,
): ResolveProviderAuth {
  return (kind) => registry.get(kind).adapters.auth;
}
