import { z } from "zod/v4";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  readJsonValue,
  writeJsonValue,
} from "@web/common/storage/json-value.store";
import {
  clampLifespan,
  DEFAULT_LIFESPAN,
  LIFE_VARIATIONS,
  type LifeVariation,
  parseLifeDate,
} from "./life.utils";

const LifePreferencesSchema = z.object({
  birthDate: z.string().default("2000-01-01"),
  lifespan: z.number().default(DEFAULT_LIFESPAN),
  variation: z.enum(["average", "long", "random"]).default("average"),
});

export interface LifePreferences {
  birthDate: string;
  lifespan: number;
  variation: LifeVariation;
}

export const DEFAULT_LIFE_PREFERENCES: LifePreferences = {
  birthDate: "2000-01-01",
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
