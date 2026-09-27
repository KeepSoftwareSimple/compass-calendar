export const WEEKS_PER_ROW = 52;
export const DEFAULT_LIFESPAN = 77;
export const MIN_LIFESPAN = 1;
export const MAX_LIFESPAN = 150;
export const RANDOM_LIFESPAN_MAX = 100;

export type LifeVariation = "average" | "long" | "random";

export interface LifeVariationDetails {
  label: string;
  defaultLifespan: number;
}

export const LIFE_VARIATIONS: Record<LifeVariation, LifeVariationDetails> = {
  average: {
    label: "Average",
    defaultLifespan: 77,
  },
  long: {
    label: "Long",
    defaultLifespan: 100,
  },
  random: {
    label: "Random",
    defaultLifespan: RANDOM_LIFESPAN_MAX,
  },
};

export const LIFE_VARIATION_ORDER: LifeVariation[] = [
  "average",
  "long",
  "random",
];

export function getLifeVariationDescription(lifespan: number) {
  return `This is your life if you live to ${lifespan}`;
}

const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;

export function clampLifespan(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_LIFESPAN;
  return Math.min(MAX_LIFESPAN, Math.max(MIN_LIFESPAN, Math.round(value)));
}

export function getTotalLifeDots(lifespan: number) {
  return WEEKS_PER_ROW * clampLifespan(lifespan);
}

export function clampWeeksLived(weeks: number, totalDots: number) {
  return Math.max(0, Math.min(weeks, totalDots));
}

export function parseLifeDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function getWeekLivedCount(
  birthDateValue: string,
  totalDots: number,
  today = new Date(),
) {
  const birthDate = parseLifeDate(birthDateValue);
  if (!birthDate) return 0;

  const diffWeeks = Math.floor(
    (today.getTime() - birthDate.getTime()) / MS_PER_WEEK,
  );

  return clampWeeksLived(diffWeeks, totalDots);
}

export function getAgeInYears(birthDateValue: string, today = new Date()) {
  const birthDate = parseLifeDate(birthDateValue);
  if (!birthDate) return null;

  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayHasPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());
  if (!birthdayHasPassed) age -= 1;
  return Math.max(0, age);
}

export function getSecureRandomNumber() {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] / 2 ** 32;
}

export function getRandomLifespan(
  birthDateValue: string,
  today = new Date(),
  random = getSecureRandomNumber,
) {
  const currentAge = getAgeInYears(birthDateValue, today) ?? MIN_LIFESPAN;
  const minimumAge = Math.max(
    MIN_LIFESPAN,
    Math.min(currentAge, RANDOM_LIFESPAN_MAX),
  );
  const range = RANDOM_LIFESPAN_MAX - minimumAge + 1;
  return minimumAge + Math.floor(random() * range);
}

export function getLifeDotLabel(weekNumber: number) {
  const yearOfLife = Math.floor((weekNumber - 1) / WEEKS_PER_ROW) + 1;
  const weekOfYear = ((weekNumber - 1) % WEEKS_PER_ROW) + 1;

  return `Year ${yearOfLife}, Week ${weekOfYear}`;
}

export function getCurrentWeekLabel(
  today: Date,
  weeksLived: number,
  totalDots: number,
) {
  const currentWeek = Math.min(weeksLived + 1, totalDots);
  const dateLabel = today.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  });

  return `${dateLabel} | week ${currentWeek} / ${totalDots}`;
}

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
