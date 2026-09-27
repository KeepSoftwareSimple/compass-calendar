import { type Locale } from "date-fns";
import enUS from "date-fns/locale/en-US";

type WeekStartsOn = NonNullable<NonNullable<Locale["options"]>["weekStartsOn"]>;

const localesByWeekStart = new Map<number, Locale>();

/**
 * react-datepicker 4.x passes `calendarStartDay` to its Month and Week
 * components but not to Day, so in `showWeekPicker` mode each day decides
 * "am I the start of my week" from the locale alone. A Monday-start view
 * would otherwise normalize the cursor to Monday at the root while the days
 * look for Sunday, and no day would be a tab stop. Handing the picker a
 * locale whose `weekStartsOn` matches the view keeps both in agreement;
 * formatting is unchanged because it is still en-US.
 */
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
