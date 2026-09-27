import {
  clampLifespan,
  getRandomLifespan,
  LIFE_VARIATION_ORDER,
  LIFE_VARIATIONS,
  type LifeVariation,
} from "./life.utils";
import { type LifePreferences } from "./life-preferences.storage";

export interface LifeSearch {
  age?: number;
  variation?: LifeVariation;
}

export function validateLifeSearch(
  search: Record<string, unknown>,
): LifeSearch {
  const variation = LIFE_VARIATION_ORDER.find(
    (value) => value === search.variation,
  );
  const rawAge =
    typeof search.age === "number"
      ? search.age
      : typeof search.age === "string"
        ? Number(search.age)
        : Number.NaN;

  return {
    age: Number.isFinite(rawAge) ? clampLifespan(rawAge) : undefined,
    variation,
  };
}

export function applyLifeSearch(
  preferences: LifePreferences,
  search: LifeSearch,
  today: Date,
): LifePreferences {
  if (!search.variation) return preferences;

  const variation = search.variation;
  const lifespan =
    search.age ??
    (variation === "random"
      ? getRandomLifespan(preferences.birthDate, today)
      : LIFE_VARIATIONS[variation].defaultLifespan);

  return { ...preferences, lifespan, variation };
}
