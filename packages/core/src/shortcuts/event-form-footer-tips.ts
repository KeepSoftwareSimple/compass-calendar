import {
  type ContextualHintPart,
  flattenTieredHint,
  tieredEventFormFooterTips,
} from "@core/shortcuts/contextual-hint-tiers";

export type EventFormFooterTipPart = ContextualHintPart;

export type EventFormFooterFocusContext = {
  focusInsideForm: boolean;
  /** False when Tab is trapped in a listbox or date popover. */
  tabNavigationApplies: boolean;
  datePickerHintActive?: boolean;
};

export type EventFormFooterTieredTips = {
  primary: readonly EventFormFooterTipPart[];
  secondary: readonly EventFormFooterTipPart[];
};

/**
 * Footer tips under Save while keyboard focus is inside the event form.
 * Tab navigation stays on the primary row; Mod+0 moves behind More.
 */
export function buildTieredEventFormFooterTips(
  ctx: EventFormFooterFocusContext,
): EventFormFooterTieredTips {
  return tieredEventFormFooterTips({
    focusInsideForm: ctx.focusInsideForm,
    tabNavigationApplies: ctx.tabNavigationApplies,
    datePickerHintActive: ctx.datePickerHintActive ?? false,
  });
}

/** Flat list for callers that still expect a single parts array. */
export function buildEventFormFooterTipParts(
  ctx: EventFormFooterFocusContext,
  expanded = false,
): readonly EventFormFooterTipPart[] {
  return flattenTieredHint(buildTieredEventFormFooterTips(ctx), expanded);
}
