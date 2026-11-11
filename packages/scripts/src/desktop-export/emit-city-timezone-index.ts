import { COMPASS_KIT_RESOURCES_DIR } from "@scripts/desktop-export/paths";
import { buildCityTimezoneIndexRows } from "@core/timezone/city-timezone-search";
import { join } from "node:path";

export const CITY_TIMEZONE_INDEX_JSON_PATH = join(
  COMPASS_KIT_RESOURCES_DIR,
  "city-timezone-index.json",
);

export function emitCityTimezoneIndexJson(): string {
  return `${JSON.stringify(buildCityTimezoneIndexRows())}\n`;
}
