import {
  clampLifespan,
  getRandomLifespan,
  LIFE_VARIATION_ORDER,
  LIFE_VARIATIONS,
  type LifeVariation,
  MAX_LIFESPAN,
  WEEKS_PER_ROW,
} from "@core/life/life-math";
import { type LifePreferences } from "./life-preferences.storage";

export interface LifeSearch {
  age?: number;
  week?: number;
  zoom?: number;
  variation?: LifeVariation;
}

function boundedInteger(value: unknown, maximum: number) {
  const n =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= maximum
    ? n
    : undefined;
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
    week: boundedInteger(search.week, MAX_LIFESPAN * WEEKS_PER_ROW - 1),
    zoom: boundedInteger(search.zoom, 2),
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
