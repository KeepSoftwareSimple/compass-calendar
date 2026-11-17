/** Intro (1) → questions (2) → choose how to start (3). */
export type WelcomeStep = 1 | 2 | 3;

export const WELCOME_STEPS: readonly WelcomeStep[] = [1, 2, 3];

export const FIRST_WELCOME_STEP: WelcomeStep = 1;
export const LAST_WELCOME_STEP: WelcomeStep = 3;

/** Clamped, so Enter on the last screen never walks past it. */
export const nextWelcomeStep = (step: WelcomeStep): WelcomeStep =>
  step === LAST_WELCOME_STEP ? step : ((step + 1) as WelcomeStep);

/** Clamped, so Escape on the first screen never leaves the welcome flow. */
export const previousWelcomeStep = (step: WelcomeStep): WelcomeStep =>
  step === FIRST_WELCOME_STEP ? step : ((step - 1) as WelcomeStep);
