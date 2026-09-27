import { type RecurrenceScope } from "@core/types/event-command.contracts";
import { RecurringEventUpdateScope } from "@web/common/types/web.event.types";

/** Broader than a one-off: following instances, or the whole series. */
export type RecurrenceScopePromotion = Exclude<RecurrenceScope, "this">;

export function toRecurrenceScope(
  scope?: RecurringEventUpdateScope,
): RecurrenceScope {
  switch (scope) {
    case RecurringEventUpdateScope.ALL_EVENTS:
      return "all";
    case RecurringEventUpdateScope.THIS_AND_FOLLOWING_EVENTS:
      return "thisAndFollowing";
    default:
      return "this";
  }
}
