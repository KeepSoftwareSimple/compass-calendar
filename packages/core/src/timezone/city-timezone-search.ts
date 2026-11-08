import {
  cityMapping,
  findFromCityStateProvince,
  lookupViaCity,
} from "city-timezones";

export interface CityTimezoneRecord {
  city: string;
  cityAscii: string;
  province: string;
  country: string;
  iso2: string;
  iana: string;
  population: number;
}

export interface PlaceTimeZoneSearchHit {
  iana: string;
  placeLabel: string;
  score: number;
  listKey: string;
  multiZoneRegion?: string;
}

/** Compact rows for native bundle export (desktop:export). */
export interface CityTimezoneIndexRow {
  city: string;
  province: string;
  iso2: string;
  iana: string;
  pop: number;
}

const US_STATE_NAMES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
]);

export function normalizePlaceSearchQuery(query: string): string {
  return query.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function shortCountry(iso2: string, country: string): string {
  if (iso2 === "US") return "US";
  return country.length > 24 ? iso2 : country;
}

function placeLabel(record: CityTimezoneRecord): string {
  const parts = [record.city];
  if (record.province) parts.push(record.province);
  parts.push(shortCountry(record.iso2, record.country));
  return parts.join(", ");
}

function toRecord(entry: (typeof cityMapping)[number]): CityTimezoneRecord {
  return {
    city: entry.city,
    cityAscii: entry.city_ascii,
    province: entry.province,
    country: entry.country,
    iso2: entry.iso2,
    iana: entry.timezone,
    population: entry.pop,
  };
}

function preferUsForStateQuery(
  query: string,
  records: CityTimezoneRecord[],
): CityTimezoneRecord[] {
  if (!US_STATE_NAMES.has(query)) return records;
  const us = records.filter((row) => row.iso2 === "US");
  return us.length > 0 ? us : records;
}

function scoreRecord(record: CityTimezoneRecord, query: string): number {
  const cityAscii = record.cityAscii.toLowerCase();
  const city = record.city.toLowerCase();
  const province = record.province.toLowerCase();
  if (cityAscii === query || city === query) return 1;
  if (cityAscii.startsWith(query) || city.startsWith(query)) return 0.9;
  if (province === query) return 0.75;
  if (cityAscii.includes(query) || province.includes(query)) return 0.6;
  return 0;
}

/**
 * City and region lookups via city-timezones (GeoNames-derived, IANA tz ids).
 * Returns up to `limit` rows with stable list keys (multiple cities may share a zone).
 */
export function searchPlaceTimeZones(
  query: string,
  limit = 60,
): PlaceTimeZoneSearchHit[] {
  const normalized = normalizePlaceSearchQuery(query);
  if (normalized.length < 2) return [];

  const rawCity = lookupViaCity(normalized).map(toRecord);
  const rawRegion = findFromCityStateProvince(normalized).map(toRecord);
  const combined = preferUsForStateQuery(normalized, [
    ...rawCity,
    ...rawRegion,
  ]);

  const scored = combined
    .map((record) => ({ record, score: scoreRecord(record, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.record.population - left.record.population;
    });

  const zonesInHits = new Set(scored.map((entry) => entry.record.iana));
  const multiZoneRegion =
    US_STATE_NAMES.has(normalized) && zonesInHits.size > 1
      ? normalized
      : undefined;

  const seenListKeys = new Set<string>();
  const hits: PlaceTimeZoneSearchHit[] = [];

  for (const { record, score } of scored) {
    const listKey = `${record.iana}:${record.cityAscii}:${record.iso2}`;
    if (seenListKeys.has(listKey)) continue;
    seenListKeys.add(listKey);
    hits.push({
      iana: record.iana,
      placeLabel: placeLabel(record),
      score,
      listKey,
      multiZoneRegion,
    });
    if (hits.length >= limit) break;
  }

  return hits;
}

export function buildCityTimezoneIndexRows(): CityTimezoneIndexRow[] {
  return cityMapping.map((entry) => ({
    city: entry.city_ascii,
    province: entry.province,
    iso2: entry.iso2,
    iana: entry.timezone,
    pop: entry.pop,
  }));
}
