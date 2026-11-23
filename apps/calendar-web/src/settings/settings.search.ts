import {
  type SettingsFocus,
  type SettingsPage,
} from "@web/settings/settings.store";

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
  "notifications",
];

/** Keep a search value only when it names a Settings page. */
export function settingsPageFromSearch(
  value: unknown,
): SettingsPage | undefined {
  return SETTINGS_PAGES.find((page) => page === value);
}

/**
 * `&focus=<control>` lands keyboard focus on one control of the opened page,
 * so an email link can end one keypress from the setting it asks about.
 */
export const SETTINGS_FOCUS_PARAM = "focus";

const SETTINGS_FOCUS_TARGETS: readonly SettingsFocus[] = ["weekly-reflection"];

export function settingsFocusFromSearch(
  value: unknown,
): SettingsFocus | undefined {
  return SETTINGS_FOCUS_TARGETS.find((target) => target === value);
}
