import { useEffect, useSyncExternalStore } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

export type BackendProviderAvailability =
  | "available"
  | "unavailable"
  | "unknown";

export type ProviderAvailabilityMode = "signIn" | "connect";

type ProviderFlags = { signIn: boolean; connect: boolean };

type AppConfigResponse = {
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
  const google = config.providers?.google;
  const microsoft = config.providers?.microsoft;
  const apple = config.providers?.apple;
  return {
    google: {
      signIn: google?.signIn ?? false,
      connect: google?.connect ?? false,
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

  const resetProviderAvailabilityForTests = () => {
    flags = {
      google: unavailableFlags,
      microsoft: unavailableFlags,
      apple: unavailableFlags,
    };
    loadPromise = undefined;
    emit();
  };

  const setProviderAvailabilityForTests = (
    kind: ProviderKind,
    availability: BackendProviderAvailability,
    mode?: ProviderAvailabilityMode,
  ) => {
    const ready = availability === "available";
    const previous = flags[kind];
    flags = {
      ...flags,
      [kind]: mode
        ? { ...previous, [mode]: ready }
        : { signIn: ready, connect: ready },
    };
    loadPromise = Promise.resolve();
    emit();
  };

  return {
    resetProviderAvailabilityForTests,
    setProviderAvailabilityForTests,
    useIsProviderAvailable,
  };
}
