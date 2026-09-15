import { z } from "zod/v4";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
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
  const raw = persistentBrowserStore.get(STORAGE_KEYS.SHORTCUT_PERSONALIZATION);
  if (!raw) return EMPTY_PROFILE;

  try {
    const parsed = JSON.parse(raw);
    const v2 = ProfileV2Schema.safeParse(parsed);
    if (v2.success) {
      return {
        version: 2,
        actions: knownActions(v2.data.actions),
        shortcuts: v2.data.shortcuts,
      };
    }

    const v1 = ProfileV1Schema.parse(parsed);
    return {
      version: 2,
      actions: knownActions(v1.actions),
      shortcuts: {},
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function writeShortcutUsageProfile(
  profile: ShortcutUsageProfile,
): boolean {
  return persistentBrowserStore.set(
    STORAGE_KEYS.SHORTCUT_PERSONALIZATION,
    JSON.stringify(profile),
  );
}
