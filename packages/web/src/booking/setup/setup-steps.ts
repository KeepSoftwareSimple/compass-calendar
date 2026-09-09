export type SetupStepId =
  | "address"
  | "hours"
  | "duration"
  | "destination"
  | "live";

export interface SetupStepDefinition {
  id: SetupStepId;
  title: string;
  sentence: string;
}

export const DESTINATION_ZERO_WRITABLE_SENTENCE =
  "Connect a calendar you can write to before going live.";

export const SETUP_STEPS: readonly SetupStepDefinition[] = [
  {
    id: "address",
    title: "Pick your address",
    sentence:
      "Choose the link people will use to book time with you. You can change it later.",
  },
  {
    id: "hours",
    title: "When can people meet with you?",
    sentence: "Set the days and times you are available each week.",
  },
  {
    id: "duration",
    title: "How long is a meeting?",
    sentence: "Pick a default length for bookings.",
  },
  {
    id: "destination",
    title: "Where should meetings go?",
    sentence: "New meetings you accept are added to this calendar.",
  },
  {
    id: "live",
    title: "Ready to go live",
    sentence: "Review your settings, then turn on your meeting page.",
  },
];

const SETUP_STEP_BY_ID = new Map(
  SETUP_STEPS.map((step) => [step.id, step] as const),
);

export function setupStepDefinition(id: SetupStepId): SetupStepDefinition {
  const step = SETUP_STEP_BY_ID.get(id);
  if (step == null) {
    throw new Error(`Unknown setup step: ${id}`);
  }
  return step;
}

export function setupStepSentence(
  id: SetupStepId,
  writableCalendarCount: number,
): string {
  if (id === "destination" && writableCalendarCount === 0) {
    return DESTINATION_ZERO_WRITABLE_SENTENCE;
  }
  return setupStepDefinition(id).sentence;
}

/** Ordered step ids for the wizard; destination is hidden only with exactly one writable calendar. */
export function visibleSetupSteps(
  writableCalendarCount: number,
): readonly SetupStepId[] {
  const steps: SetupStepId[] = ["address", "hours", "duration"];
  if (writableCalendarCount !== 1) {
    steps.push("destination");
  }
  steps.push("live");
  return steps;
}

export function setupStepProgress(
  stepId: SetupStepId,
  writableCalendarCount: number,
): { current: number; total: number } {
  const steps = visibleSetupSteps(writableCalendarCount);
  const index = steps.indexOf(stepId);
  return { current: index + 1, total: steps.length };
}

export function nextSetupStep(
  stepId: SetupStepId,
  writableCalendarCount: number,
): SetupStepId | null {
  const steps = visibleSetupSteps(writableCalendarCount);
  const index = steps.indexOf(stepId);
  if (index < 0 || index >= steps.length - 1) return null;
  return steps[index + 1] ?? null;
}

export function prevSetupStep(
  stepId: SetupStepId,
  writableCalendarCount: number,
): SetupStepId | null {
  const steps = visibleSetupSteps(writableCalendarCount);
  const index = steps.indexOf(stepId);
  if (index <= 0) return null;
  return steps[index - 1] ?? null;
}
