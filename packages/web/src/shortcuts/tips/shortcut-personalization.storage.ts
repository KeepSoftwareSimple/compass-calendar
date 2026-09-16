import { z } from "zod/v4";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  readJsonValue,
  writeJsonValue,
} from "@web/common/storage/json-value.store";
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

export function writeShortcutUsageProfile(
  profile: ShortcutUsageProfile,
): boolean {
  return writeJsonValue(STORAGE_KEYS.SHORTCUT_PERSONALIZATION, profile);
}
