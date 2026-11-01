/** Commit (1) → learn (2) → choose how to start (3) → shortcuts (4). */
export type WelcomeStep = 1 | 2 | 3 | 4;

export const WELCOME_STEPS: readonly WelcomeStep[] = [1, 2, 3, 4];

export const FIRST_WELCOME_STEP: WelcomeStep = 1;
export const LAST_WELCOME_STEP: WelcomeStep = 4;

/** Local-only explorers see keyboard shortcuts after the account-choice screen. */
export const WELCOME_KEYBOARD_SHORTCUTS_STEP: WelcomeStep = 4;

/** Clamped, so Enter on the last screen never walks past it. */
export const nextWelcomeStep = (step: WelcomeStep): WelcomeStep =>
  step === LAST_WELCOME_STEP ? step : ((step + 1) as WelcomeStep);

/** Clamped, so Escape on the first screen never leaves the welcome flow. */
export const previousWelcomeStep = (step: WelcomeStep): WelcomeStep =>
  step === FIRST_WELCOME_STEP ? step : ((step - 1) as WelcomeStep);
