import fastDeepEqual from "fast-deep-equal/react";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  editGridEventDraft,
  gridDraftGuestsChanged,
  resolveDraftRecurrenceRules,
} from "@web/events/grid-event-draft.adapter";

/**
 * Parser for determining if an event has been modified (is dirty)
 */
export class DirtyParser {
  /**
   * Private Static method to check if the recurrence rules have changed
   */
  private static isRuleDifferent(
    curr: CompassEvent,
    orig: CompassEvent,
  ): boolean {
    const oldRecurrence = orig?.recurrence?.rule ?? [];
    const newRecurrence = curr?.recurrence?.rule ?? [];

    if (oldRecurrence.length !== newRecurrence.length) return true;

    const oldRuleFields = oldRecurrence.flatMap((rule) => rule.split(";"));
    const newRuleFields = newRecurrence.flatMap((rule) => rule.split(";"));
    const oldRuleSet = [...new Set(oldRuleFields)];
    const newRuleSet = [...new Set(newRuleFields)];

    return (
      newRuleSet.some((rule) => !oldRuleSet.includes(rule)) ||
      oldRuleSet.some((rule) => !newRuleSet.includes(rule))
    );
  }

  /**
   * Private Static method to check if start or end dates have changed
   */
  private static isDateDifferent(
    curr: CompassEvent,
    orig: CompassEvent,
  ): boolean {
    const oldStartDate = orig?.startDate;
    const newStartDate = curr?.startDate;
    const oldEndDate = orig?.endDate;
    const newEndDate = curr?.endDate;

    return oldStartDate !== newStartDate || oldEndDate !== newEndDate;
  }

  /**
   * Public Static method to check if recurrence has changed
   */
  public static recurrenceChanged(
    curr: CompassEvent,
    orig: CompassEvent,
  ): boolean {
    return (
      DirtyParser.isDateDifferent(curr, orig) ||
      DirtyParser.isRuleDifferent(curr, orig)
    );
  }

  public static gridDraftRecurrenceChanged(
    current: GridEventDraft,
    original: GridEventDraft,
    seriesRules?: readonly string[],
  ): boolean {
    if (
      current.values.schedule.start.getTime() !==
      original.values.schedule.start.getTime()
    ) {
      return true;
    }

    if (
      current.values.schedule.end.getTime() !==
      original.values.schedule.end.getTime()
    ) {
      return true;
    }

    const currentRules = resolveDraftRecurrenceRules(current, seriesRules);
    const originalRules = resolveDraftRecurrenceRules(original, seriesRules);

    return !fastDeepEqual(currentRules, originalRules);
  }

  /**
   * Static method to check if the curr event has been modified
   */
  static isEventDirty(curr: CompassEvent, orig: CompassEvent): boolean {
    // Compare relevant fields that can change in the form
    const fieldsToCompare = [
      "title",
      "description",
      "startDate",
      "endDate",
      "recurrence",
    ] as const;

    return fieldsToCompare.some((field) => {
      const current = curr[field];
      const original = orig[field];
      const isRecurrenceField = field === "recurrence";

      return isRecurrenceField
        ? DirtyParser.recurrenceChanged(curr, orig)
        : current !== original;
    });
  }

  /**
   * GridEventDraft-comparable dirty check for an in-progress edit: rebuilds
   * the pristine draft the edit started from (via editGridEventDraft on the
   * same source/scope) and compares against it field-by-field, rather than
   * against CompassEvent fields. Recurrence is compared by kind only (not by
   * rule-array equality like isEventDirty does) — an edit draft's recurrence
   * starts at "preserve" and only ever changes kind when the user explicitly
   * toggles it, so a kind mismatch is a reliable-enough dirty signal for
   * this narrower comparison.
   */
  static isGridDraftDirty(
    draft: Extract<GridEventDraft, { kind: "edit" }>,
  ): boolean {
    const pristine = editGridEventDraft(draft.source, draft.values.scope);
    if (!pristine) return true;

    const { values } = draft;
    const orig = pristine.values;

    if (values.title !== orig.title) return true;
    if (values.description !== orig.description) return true;
    if (values.location !== orig.location) return true;
    if (values.color !== orig.color) return true;
    if (values.calendarId !== orig.calendarId) return true;
    if (values.schedule.kind !== orig.schedule.kind) return true;
    if (values.schedule.start.getTime() !== orig.schedule.start.getTime()) {
      return true;
    }
    if (values.schedule.end.getTime() !== orig.schedule.end.getTime()) {
      return true;
    }
    if (values.recurrence.kind !== orig.recurrence.kind) return true;
    // A pristine edit draft never carries `attendees`; a touched guest list
    // is only dirty when it actually changes membership (adding a guest and
    // removing them again closes without prompting, like retyping a title).
    if (gridDraftGuestsChanged(draft)) return true;

    return false;
  }
}
