import { z } from "zod/v4";
import {
  clampLifespan,
  DEFAULT_LIFESPAN,
  LIFE_VARIATIONS,
  type LifeVariation,
  parseLifeDate,
} from "@core/life/life-math";
import {
  type LifePreferencesResponse,
  LifePreferencesResponseSchema,
} from "@core/types/life-preferences.contracts";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  readJsonValue,
  writeJsonValue,
} from "@web/common/storage/json-value.store";

const LifePreferencesSchema = z.object({
  birthDate: z.string().default(""),
  lifespan: z.number().default(DEFAULT_LIFESPAN),
  variation: z.enum(["average", "long", "random"]).default("average"),
});

export interface LifePreferences {
  birthDate: string;
  lifespan: number;
  variation: LifeVariation;
}

export const DEFAULT_LIFE_PREFERENCES: LifePreferences = {
  birthDate: "",
  lifespan: LIFE_VARIATIONS.average.defaultLifespan,
  variation: "average",
};

function normalizeLifePreferences(
  preferences: LifePreferences,
): LifePreferences {
  return {
    birthDate: parseLifeDate(preferences.birthDate)
      ? preferences.birthDate
      : "",
    lifespan: clampLifespan(preferences.lifespan),
    variation: preferences.variation,
  };
}

const StoredLifePreferencesSchema = LifePreferencesSchema.transform(
  normalizeLifePreferences,
);

export function readLifePreferences(): LifePreferences {
  return readJsonValue(
    STORAGE_KEYS.LIFE_PREFERENCES,
    StoredLifePreferencesSchema,
    DEFAULT_LIFE_PREFERENCES,
  );
}

export function hasLifePreferences() {
  return persistentBrowserStore.get(STORAGE_KEYS.LIFE_PREFERENCES) !== null;
}

export function writeLifePreferences(preferences: LifePreferences) {
  writeJsonValue(
    STORAGE_KEYS.LIFE_PREFERENCES,
    normalizeLifePreferences(preferences),
  );
}

const ACCOUNT_LIFE_PREFIX = "compass.life.account.";
export function readAccountLifePreferences(userId: string) {
  return readJsonValue(
    `${ACCOUNT_LIFE_PREFIX}${userId}`,
    LifePreferencesResponseSchema.nullable(),
    null,
  );
}
export function writeAccountLifePreferences(
  userId: string,
  value: LifePreferencesResponse,
) {
  writeJsonValue(`${ACCOUNT_LIFE_PREFIX}${userId}`, value);
}
export function clearAccountLifePreferences() {
  for (const key of persistentBrowserStore.keys())
    if (key.startsWith(ACCOUNT_LIFE_PREFIX)) persistentBrowserStore.remove(key);
}
