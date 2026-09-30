import { type SettingsPage } from "@web/settings/settings.store";

/**
 * `/?settings=<page>` opens the Settings modal on that page. Settings is
 * store state rather than a route, so this is the only URL that can land
 * someone on a given page. The welcome emails link here
 * (packages/backend/src/email/welcome-sequence.content.ts).
 */
export const SETTINGS_SEARCH_PARAM = "settings";

const SETTINGS_PAGES: readonly SettingsPage[] = [
  "accounts",
  "billing",
  "booking",
];

/** Keep a search value only when it names a Settings page. */
export function settingsPageFromSearch(
  value: unknown,
): SettingsPage | undefined {
  return SETTINGS_PAGES.find((page) => page === value);
}
