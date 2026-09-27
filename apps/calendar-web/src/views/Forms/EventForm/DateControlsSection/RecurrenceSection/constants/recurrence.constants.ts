import { Frequency, RRule } from "rrule";

export type FrequencyValues = Exclude<
  Frequency,
  Frequency.HOURLY | Frequency.MINUTELY | Frequency.SECONDLY
>;

export const FREQUENCY_MAP: Record<FrequencyValues, string> = {
  [Frequency.DAILY]: "Day",
  [Frequency.WEEKLY]: "Week",
  [Frequency.MONTHLY]: "Month",
  [Frequency.YEARLY]: "Year",
};

const RECURRENCE_FREQUENCIES: FrequencyValues[] = [
  Frequency.DAILY,
  Frequency.WEEKLY,
  Frequency.MONTHLY,
  Frequency.YEARLY,
];

export const FREQUENCY_OPTIONS = (suffix = "") =>
  RECURRENCE_FREQUENCIES.map((frequency) => ({
    label: `${FREQUENCY_MAP[frequency as FrequencyValues]}${suffix}`,
    value: frequency,
  }));

export const WEEKDAYS: Array<keyof typeof WEEKDAY_RRULE_MAP> = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const WEEKDAY_RRULE_MAP = {
  monday: RRule.MO,
  tuesday: RRule.TU,
  wednesday: RRule.WE,
  thursday: RRule.TH,
  friday: RRule.FR,
  saturday: RRule.SA,
  sunday: RRule.SU,
};
