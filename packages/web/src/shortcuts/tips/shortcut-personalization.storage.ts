import { useSyncExternalStore } from "react";
import { z } from "zod/v4";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  readJsonValue,
  writeJsonValue,
} from "@web/common/storage/json-value.store";
import { createStorageBackedStore } from "@web/common/utils/external-store.util";
import {
  SHORTCUT_HINTS,
  type ShortcutActionId,
} from "@web/shortcuts/tips/shortcut-tips.data";

export type ShortcutActionUsage = {
  invocations: number;
  lastInvokedAt?: number;
  lastShownAt?: number;
  recentImpressions: number;
};

export type ShortcutUsageProfile = {
  version: 2;
  actions: Partial<Record<ShortcutActionId, ShortcutActionUsage>>;
  shortcuts: Record<string, ShortcutActionUsage>;
};

const ActionUsageSchema = z.object({
  invocations: z.number().int().nonnegative(),
  lastInvokedAt: z.number().int().nonnegative().optional(),
  lastShownAt: z.number().int().nonnegative().optional(),
  recentImpressions: z.number().int().nonnegative(),
});

const ProfileV1Schema = z.object({
  version: z.literal(1),
  actions: z.record(z.string(), ActionUsageSchema),
});

const ProfileV2Schema = z.object({
  version: z.literal(2),
  actions: z.record(z.string(), ActionUsageSchema),
  shortcuts: z.record(z.string(), ActionUsageSchema),
});

// Either stored shape reads back as v2: a v1 profile predates per-shortcut
// counters, so it upgrades with an empty `shortcuts` map. Action ids this
// build no longer knows are dropped rather than ranked.
const StoredProfileSchema = z
  .union([ProfileV2Schema, ProfileV1Schema])
  .transform(
    (stored): ShortcutUsageProfile => ({
      version: 2,
      actions: knownActions(stored.actions),
      shortcuts: stored.version === 2 ? stored.shortcuts : {},
    }),
  );

const EMPTY_PROFILE: ShortcutUsageProfile = {
  version: 2,
  actions: {},
  shortcuts: {},
};
const actionIds = new Set<ShortcutActionId>(
  Object.values(SHORTCUT_HINTS).map((hint) => hint.actionId),
);

function knownActions(
  raw: Record<string, ShortcutActionUsage>,
): ShortcutUsageProfile["actions"] {
  const actions: ShortcutUsageProfile["actions"] = {};
  for (const [actionId, usage] of Object.entries(raw)) {
    if (actionIds.has(actionId as ShortcutActionId)) {
      actions[actionId as ShortcutActionId] = usage;
    }
  }
  return actions;
}

export function readShortcutUsageProfile(): ShortcutUsageProfile {
  return readJsonValue(
    STORAGE_KEYS.SHORTCUT_PERSONALIZATION,
    StoredProfileSchema,
    EMPTY_PROFILE,
  );
}

/** Publishes writes to {@link useShortcutUsageProfile} - storage stays the
 * source of truth, this only makes changes to it observable. */
const profileStore = createStorageBackedStore(
  STORAGE_KEYS.SHORTCUT_PERSONALIZATION,
  readShortcutUsageProfile,
);

export function writeShortcutUsageProfile(
  profile: ShortcutUsageProfile,
): boolean {
  const wrote = writeJsonValue(STORAGE_KEYS.SHORTCUT_PERSONALIZATION, profile);
  if (wrote) profileStore.set(profile);
  return wrote;
}

/** Reactive read of the usage profile, for the legend and the shortcut level
 * badge. Republishes on every write from this tab and on a cross-tab
 * storage event for the same key. */
export function useShortcutUsageProfile(): ShortcutUsageProfile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get);
}

/** The registry ids this browser has used at least once. */
export function usedShortcutIds(
  profile: ShortcutUsageProfile,
): ReadonlySet<string> {
  return new Set(
    Object.entries(profile.shortcuts)
      .filter(([, usage]) => usage.invocations > 0)
      .map(([id]) => id),
  );
}

/** Test-only: resyncs the reactive store from storage after a direct seed. */
export function resetShortcutUsageProfileStoreForTests(): void {
  profileStore.refresh();
}
