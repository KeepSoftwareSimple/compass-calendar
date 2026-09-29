import { type PointerIntent } from "@web/shortcuts/pointer-intent/pointer-intent";

const shownIntents = new Set<PointerIntent>();
let hintsShownThisSession = 0;
const detectedIntentLog: PointerIntent[] = [];

export type PointerIntentSessionSnapshot = {
  shownIntents: ReadonlySet<PointerIntent>;
  hintsShownThisSession: number;
};

export function getPointerIntentSessionSnapshot(): PointerIntentSessionSnapshot {
  return {
    shownIntents,
    hintsShownThisSession,
  };
}

export function recordPointerIntentDetection(intent: PointerIntent): void {
  detectedIntentLog.push(intent);
}

/** Intents classified this session (WP-06 newcomer tip ranking). */
export function detectedIntents(): readonly PointerIntent[] {
  return detectedIntentLog;
}

export function markPointerIntentHintShown(intent: PointerIntent): void {
  shownIntents.add(intent);
  hintsShownThisSession += 1;
}

export function resetPointerIntentSessionForTests(): void {
  shownIntents.clear();
  hintsShownThisSession = 0;
  detectedIntentLog.length = 0;
}
