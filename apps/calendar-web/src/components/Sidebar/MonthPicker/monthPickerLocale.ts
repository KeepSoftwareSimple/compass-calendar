import { type Locale } from "date-fns";
import { enUS } from "date-fns/locale/en-US";

type WeekStartsOn = NonNullable<NonNullable<Locale["options"]>["weekStartsOn"]>;

const localesByWeekStart = new Map<number, Locale>();

// Keep the date-picker's locale aligned with the visible week start.
export const monthPickerLocale = (weekStartDay: number): Locale => {
  const cached = localesByWeekStart.get(weekStartDay);
  if (cached) return cached;
  const locale: Locale = {
    ...enUS,
    options: { ...enUS.options, weekStartsOn: weekStartDay as WeekStartsOn },
  };
  localesByWeekStart.set(weekStartDay, locale);
  return locale;
};
