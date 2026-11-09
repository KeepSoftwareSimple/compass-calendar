import { KEYMAP } from "@core/shortcuts/keymap";

export type ContextualHintPart =
  | string
  | { key: string }
  | { keys: readonly string[] };

export type TieredContextualHint = {
  primary: readonly ContextualHintPart[];
  secondary: readonly ContextualHintPart[];
};

const sep = " · " as const;

/** Join primary and optional secondary segments for display when expanded. */
export function flattenTieredHint(
  tiered: TieredContextualHint,
  expanded: boolean,
): readonly ContextualHintPart[] {
  if (!expanded || tiered.secondary.length === 0) {
    return tiered.primary;
  }
  return [...tiered.primary, sep, ...tiered.secondary];
}

function keycapGroups(parts: readonly ContextualHintPart[]): number {
  return parts.filter((part) => typeof part !== "string").length;
}

/** Assert scannable defaults: at most four keycap groups on the primary row. */
export function assertPrimaryHintBudget(
  tiered: TieredContextualHint,
  maxGroups = 4,
): void {
  if (keycapGroups(tiered.primary) > maxGroups) {
    throw new Error(
      `primary hint shows ${keycapGroups(tiered.primary)} key groups (max ${maxGroups})`,
    );
  }
}

const FORM_FOOTER_TAB_PRIMARY = [
  { keys: ["Tab"] },
  " / ",
  { keys: ["Shift", "Tab"] },
  " between fields",
] as const satisfies readonly ContextualHintPart[];

const FORM_FOOTER_ACTIONS_SECONDARY = [
  "Hold ",
  { key: KEYMAP.jumpFormField.holdModifier },
  " then ",
  { key: "0" },
  " for actions",
] as const satisfies readonly ContextualHintPart[];

export function tieredEventFormFooterTips(ctx: {
  focusInsideForm: boolean;
  tabNavigationApplies: boolean;
  /** A grid date picker is publishing sidebar keyboard help. */
  datePickerHintActive: boolean;
}): TieredContextualHint {
  if (!ctx.focusInsideForm || ctx.datePickerHintActive) {
    return { primary: [], secondary: [] };
  }

  const primary: ContextualHintPart[] = [];
  const secondary: ContextualHintPart[] = [];

  if (ctx.tabNavigationApplies) {
    primary.push(...FORM_FOOTER_TAB_PRIMARY);
  } else {
    primary.push(...FORM_FOOTER_ACTIONS_SECONDARY);
    assertPrimaryHintBudget({ primary, secondary });
    return { primary, secondary: [] };
  }

  secondary.push(...FORM_FOOTER_ACTIONS_SECONDARY);
  const tiered = { primary, secondary };
  assertPrimaryHintBudget(tiered);
  return tiered;
}

export function tieredDatePickerGridDayHints(): TieredContextualHint {
  const tiered = {
    primary: [
      { keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] },
      " move date",
      sep,
      { keys: ["Enter"] },
      " pick",
      sep,
      { keys: ["Esc"] },
      " close",
    ],
    secondary: [
      { keys: ["ArrowLeft", "ArrowRight"] },
      " day",
      sep,
      { keys: ["ArrowUp", "ArrowDown"] },
      " week",
      sep,
      { keys: ["PageDown"] },
      " month",
      sep,
      { keys: ["Shift", "PageDown"] },
      " year",
      sep,
      { keys: ["Tab"] },
      " leave and save typed text",
    ],
  } as const satisfies TieredContextualHint;
  assertPrimaryHintBudget(tiered);
  return tiered;
}

export function tieredDatePickerGridCaptionHints(
  kind: "month" | "year",
): TieredContextualHint {
  if (kind === "month") {
    const tiered = {
      primary: [
        { keys: ["ArrowUp", "ArrowDown"] },
        " move",
        sep,
        { keys: ["Enter"] },
        " select",
        sep,
        { keys: ["Esc"] },
        " back",
      ],
      secondary: [] as const,
    } satisfies TieredContextualHint;
    assertPrimaryHintBudget(tiered);
    return tiered;
  }
  const tiered = {
    primary: [
      { keys: ["ArrowUp", "ArrowDown"] },
      " move years",
      sep,
      { keys: ["Enter"] },
      " months",
      sep,
      { keys: ["Esc"] },
      " back",
    ],
    secondary: [] as const,
  } satisfies TieredContextualHint;
  assertPrimaryHintBudget(tiered);
  return tiered;
}

export function tieredDatePickerOpenInputHints(
  label: string,
): TieredContextualHint {
  const tiered = {
    primary: [
      { keys: ["Enter"] },
      ` save ${label}`,
      sep,
      { keys: ["Esc"] },
      " dismiss",
    ],
    secondary: [
      { keys: ["ArrowDown"] },
      " calendar",
      sep,
      { keys: ["Tab"] },
      " leave and save typed text",
    ],
  } as const satisfies TieredContextualHint;
  assertPrimaryHintBudget(tiered);
  return tiered;
}

export function tieredSidebarMonthPickerHints(): TieredContextualHint {
  const tiered = {
    primary: [
      { keys: ["ArrowUp", "ArrowDown"] },
      " move",
      sep,
      { keys: ["Enter"] },
      " select",
      sep,
      { keys: ["U"] },
      " back to grid",
    ],
    secondary: [] as const,
  } satisfies TieredContextualHint;
  assertPrimaryHintBudget(tiered);
  return tiered;
}

export function tieredRecurrenceUntilHints(): TieredContextualHint {
  const tiered = {
    primary: [
      { keys: ["ArrowLeft", "ArrowRight"] },
      " day",
      sep,
      { keys: ["Enter"] },
      " pick end",
      sep,
      { keys: ["Esc"] },
      " close",
    ],
    secondary: [
      { keys: ["ArrowUp", "ArrowDown"] },
      " week",
      sep,
      { keys: ["PageDown"] },
      " month",
      sep,
      { keys: ["Shift", "PageDown"] },
      " year",
    ],
  } as const satisfies TieredContextualHint;
  assertPrimaryHintBudget(tiered);
  return tiered;
}

/** macOS event form footer when the date grid popover is open. */
export function tieredNativeEventFormDatePickerFooterHints(): TieredContextualHint {
  return tieredDatePickerGridDayHints();
}
