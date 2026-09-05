import { useEffect, useSyncExternalStore } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

const PROVIDER_KINDS: readonly ProviderKind[] = [
  "google",
  "microsoft",
  "apple",
];
const NO_CONNECTABLE: ProviderKind[] = [];

export type BackendProviderAvailability =
  | "available"
  | "unavailable"
  | "unknown";

export type ProviderAvailabilityMode = "signIn" | "connect";

type ProviderFlags = { signIn: boolean; connect: boolean };

type AppConfigResponse = {
  google?: { isConfigured?: boolean };
  providers?: Partial<
    Record<ProviderKind, { signIn?: boolean; connect?: boolean }>
  >;
};

type ProviderAvailabilityDependencies = {
  getConfig: () => Promise<AppConfigResponse>;
  isGoogleAuthConfigured: boolean;
};

const unavailableFlags: ProviderFlags = { signIn: false, connect: false };

const flagsFromConfig = (
  config: AppConfigResponse,
): Record<ProviderKind, ProviderFlags> => {
  const googleConfigured = Boolean(config.google?.isConfigured);
  const google = config.providers?.google;
  const microsoft = config.providers?.microsoft;
  const apple = config.providers?.apple;
  return {
    google: {
      signIn: google?.signIn ?? googleConfigured,
      connect: google?.connect ?? googleConfigured,
    },
    microsoft: {
      signIn: microsoft?.signIn ?? false,
      connect: microsoft?.connect ?? false,
    },
    apple: {
      signIn: apple?.signIn ?? false,
      connect: apple?.connect ?? false,
    },
  };
};

export function createProviderAvailability({
  getConfig,
  isGoogleAuthConfigured,
}: ProviderAvailabilityDependencies) {
  const listeners = new Set<() => void>();
  let flags: Record<ProviderKind, ProviderFlags> = {
    google: unavailableFlags,
    microsoft: unavailableFlags,
    apple: unavailableFlags,
  };
  let loadPromise: Promise<void> | undefined;
  let connectableCache: ProviderKind[] = NO_CONNECTABLE;

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const snapshotFor = (
    kind: ProviderKind,
    mode: ProviderAvailabilityMode,
  ): boolean => {
    const ready = flags[kind][mode];
    if (kind === "google" && mode === "signIn") {
      return isGoogleAuthConfigured && ready;
    }
    return ready;
  };

  const connectableSnapshot = (): ProviderKind[] => {
    const next = PROVIDER_KINDS.filter((kind) => snapshotFor(kind, "connect"));
    if (
      next.length === connectableCache.length &&
      next.every((kind, index) => kind === connectableCache[index])
    ) {
      return connectableCache;
    }
    connectableCache = next.length === 0 ? NO_CONNECTABLE : next;
    return connectableCache;
  };

  const load = async (): Promise<void> => {
    if (!loadPromise) {
      loadPromise = getConfig()
        .then((config) => {
          flags = flagsFromConfig(config);
          emit();
        })
        .catch(() => {
          loadPromise = undefined;
          flags = {
            google: unavailableFlags,
            microsoft: unavailableFlags,
            apple: unavailableFlags,
          };
          emit();
        });
    }
    return loadPromise;
  };

  const useIsProviderAvailable = (
    kind: ProviderKind,
    mode: ProviderAvailabilityMode,
  ): boolean => {
    const available = useSyncExternalStore(
      subscribe,
      () => snapshotFor(kind, mode),
      () => snapshotFor(kind, mode),
    );

    useEffect(() => {
      void load();
    }, []);

    return available;
  };

  const useConnectableProviders = (): ProviderKind[] => {
    const connectable = useSyncExternalStore(
      subscribe,
      connectableSnapshot,
      connectableSnapshot,
    );

    useEffect(() => {
      void load();
    }, []);

    return connectable;
  };

  const useIsGoogleAvailable = (): boolean =>
    useIsProviderAvailable("google", "signIn");

  const useIsConnectGoogleAvailable = (): boolean =>
    useIsProviderAvailable("google", "connect");

  const resetGoogleAvailabilityForTests = () => {
    flags = {
      google: unavailableFlags,
      microsoft: unavailableFlags,
      apple: unavailableFlags,
    };
    loadPromise = undefined;
    connectableCache = NO_CONNECTABLE;
    emit();
  };

  const setGoogleAvailabilityForTests = (
    availability: BackendProviderAvailability,
  ) => {
    const ready = availability === "available";
    flags = {
      ...flags,
      google: { signIn: ready, connect: ready },
    };
    loadPromise = Promise.resolve();
    emit();
  };

  const setProviderAvailabilityForTests = (
    kind: ProviderKind,
    availability: BackendProviderAvailability,
  ) => {
    const ready = availability === "available";
    flags = {
      ...flags,
      [kind]: { signIn: ready, connect: ready },
    };
    loadPromise = Promise.resolve();
    emit();
  };

  const resetProviderAvailabilityForTests = resetGoogleAvailabilityForTests;

  return {
    resetGoogleAvailabilityForTests,
    resetProviderAvailabilityForTests,
    setGoogleAvailabilityForTests,
    setProviderAvailabilityForTests,
    useIsGoogleAvailable,
    useIsConnectGoogleAvailable,
    useIsProviderAvailable,
    useConnectableProviders,
  };
}
