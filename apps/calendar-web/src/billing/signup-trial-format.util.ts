import dayjs from "@core/util/date/dayjs";

/** Charge date copy: "Monday, September 29" from trial length and a reference instant. */
export function formatTrialChargeDate(
  trialLengthDays: number,
  now: dayjs.Dayjs = dayjs(),
): string {
  return now.add(trialLengthDays, "day").format("dddd, MMMM D");
}

/** Trial ask charge-date line below the title. */
export function formatTrialAskChargeLine(
  trialLengthDays: number,
  now: dayjs.Dayjs = dayjs(),
): string {
  return `No charge until ${formatTrialChargeDate(trialLengthDays, now)}. Cancel anytime.`;
}

export function formatSignupTrialTitle(trialLengthDays: number): string {
  return `Start your ${trialLengthDays}-day free trial`;
}

export function formatTrialStepWriteLead(trialLengthDays: number): string {
  return `Add a card to start your ${trialLengthDays}-day free trial and save changes to your calendar.`;
}

export function formatExploreTrialBannerMessage(
  trialLengthDays: number,
): string {
  return `Start your ${trialLengthDays}-day free trial to plan your week.`;
}
