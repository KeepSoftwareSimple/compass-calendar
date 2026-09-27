import { type RecurrenceScopePromotion } from "@web/events/recurrence/recurrence-scope";
import { digitPickIndex } from "@web/shortcuts/digit-pick.util";

/** Maps the series-scope toast's advertised keys: 1 = following, 2 = all. */
export const recurrenceScopeForToastDigit = (
  event: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey">,
): RecurrenceScopePromotion | null => {
  const pickIndex = digitPickIndex(event);
  if (pickIndex === 0) return "thisAndFollowing";
  if (pickIndex === 1) return "all";
  return null;
};
