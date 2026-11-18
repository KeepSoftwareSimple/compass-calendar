import { type PlaceTimeZoneSearchHit } from "@core/timezone/city-timezone-search";
import { importOrReload } from "@web/common/utils/browser/missing-chunk-reload.util";

type CityTimezoneSearchModule =
  typeof import("@core/timezone/city-timezone-search");

let loadedModule: CityTimezoneSearchModule | null = null;
let loadPromise: Promise<CityTimezoneSearchModule> | null = null;

function startLoad(): Promise<CityTimezoneSearchModule> {
  loadPromise ??= importOrReload(
    () => import("@core/timezone/city-timezone-search"),
  ).then((module) => {
    loadedModule = module;
    return module;
  });
  return loadPromise;
}

/** Warm the city-timezones chunk; safe to call repeatedly. */
export function preloadPlaceTimeZoneSearch(): void {
  void startLoad();
}

export function whenPlaceTimeZoneSearchReady(): Promise<CityTimezoneSearchModule> {
  return startLoad();
}

export function searchPlaceTimeZonesLazy(
  query: string,
  limit = 60,
): PlaceTimeZoneSearchHit[] {
  if (!loadedModule) return [];
  return loadedModule.searchPlaceTimeZones(query, limit);
}

export async function ensurePlaceTimeZoneSearchForTests(): Promise<void> {
  await startLoad();
}
