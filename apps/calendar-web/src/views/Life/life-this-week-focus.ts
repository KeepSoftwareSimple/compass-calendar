import { parseLifeDate } from "@core/life/life-math";
import { type LifePreferences } from "@web/views/Life/life-preferences.storage";

/** Matches LifeView `showCurrentWeek` / `hasBirthDate`. */
export function isLifeThisWeekFocusEligible(
  preferences: Pick<LifePreferences, "birthDate">,
): boolean {
  return parseLifeDate(preferences.birthDate) !== null;
}
