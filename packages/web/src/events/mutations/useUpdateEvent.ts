import { useQueryClient } from "@tanstack/react-query";
import fastDeepEqual from "fast-deep-equal/es6";
import { useCallback } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import dayjs from "@core/util/date/dayjs";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import {
  buildCalendarLookup,
  isEventReadOnly,
} from "@web/calendars/useCalendarLookup";
import {
  type GridEvent,
  type RecurringEventUpdateScope,
} from "@web/common/types/web.event.types";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import {
  editGridEventDraft,
  parseGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { eventSchedulesEqual } from "@web/events/mutations/event-schedule-equal";
import {
  type EventMutationCallbacks,
  type EventMutationDependencies,
  useEventMutations,
} from "@web/events/mutations/useEventMutations";
import {
  findEventInCache,
  removeEventFromQueries,
} from "@web/events/queries/event.query.cache";
import { toRecurrenceScope } from "@web/events/recurrence/recurrence-scope";
import { type RecurrenceScopeAskTiming } from "@web/events/recurrence/recurrence-scope-opportunity.store";

// Builds a GridEventDraft from the cached strict `Event` plus the incoming
// GridEvent's changed fields (schedule/title/description), instead of
// hand-rolling a ReplaceEventInput via zod. Recurrence always stays
// "preserve" here — this hook only ever moves/resizes an existing event,
// never edits its recurrence rule.
export function useUpdateEvent(dependencies: EventMutationDependencies = {}) {
  const queryClient = useQueryClient();
  const { replace } = useEventMutations(dependencies);

  const update = useCallback(
    (
      payload: {
        event: GridEvent;
        shouldRemove?: boolean;
        applyTo?: RecurringEventUpdateScope;
        // Keyboard nudges set this so the series ask waits for Shift release.
        scopeAsk?: RecurrenceScopeAskTiming;
      },
      saveImmediate = true,
      callbacks?: EventMutationCallbacks,
    ): boolean => {
      const { event, shouldRemove, applyTo, scopeAsk } = payload;

      // Callers pass onOptimisticApplied to tear down covering drafts. When
      // the mutation never starts (blocked/no-op), still run it so drafts do
      // not stick — same teardown, without an optimistic cache write.
      const finishWithoutMutation = () => {
        callbacks?.onOptimisticApplied?.();
        return false;
      };

      if (!event._id) return finishWithoutMutation();

      if (!saveImmediate) return finishWithoutMutation();

      if (shouldRemove) {
        removeEventFromQueries(queryClient, event._id);
        return finishWithoutMutation();
      }

      const sourceEvent = findEventInCache(queryClient, event._id);
      if (!sourceEvent) return finishWithoutMutation();

      // A differing calendarId means the drag dropped the event on another
      // calendar's column (Day view). Guard here so a blocked move reverts
      // the whole drag; the backend re-enforces both rules.
      const nextCalendarId =
        event.calendarId && event.calendarId !== sourceEvent.calendarId
          ? event.calendarId
          : null;
      if (nextCalendarId) {
        if (sourceEvent.recurrence.kind !== "single") {
          showErrorToast("Repeating events can't move to another calendar.");
          return finishWithoutMutation();
        }
        if (sourceEvent.providerManaged === true) {
          showErrorToast(
            "This event's time follows your calendar provider and can't be moved in Compass.",
          );
          return finishWithoutMutation();
        }
        const lookup = buildCalendarLookup(
          queryClient.getQueryData<Calendar[]>(calendarQueryKeys.all),
        );
        if (isEventReadOnly(lookup, nextCalendarId, false)) {
          const name = lookup.get(nextCalendarId)?.name ?? "that calendar";
          showErrorToast(`You can't move events to ${name}.`);
          return finishWithoutMutation();
        }
      }

      const sourceDraft = editGridEventDraft(
        sourceEvent,
        toRecurrenceScope(applyTo),
      );
      if (!sourceDraft || sourceDraft.kind !== "edit") {
        return finishWithoutMutation();
      }

      const patchedDraft = {
        ...sourceDraft,
        values: {
          ...sourceDraft.values,
          title: event.title ?? sourceDraft.values.title,
          description: event.description ?? sourceDraft.values.description,
          schedule: event.isAllDay
            ? {
                kind: "allDay" as const,
                start: dayjs(event.startDate).toDate(),
                end: dayjs(event.endDate).toDate(),
              }
            : timedGridSchedule(
                dayjs(event.startDate).toDate(),
                dayjs(event.endDate).toDate(),
              ),
        },
      };

      if (
        !nextCalendarId &&
        fastDeepEqual(patchedDraft.values, sourceDraft.values)
      ) {
        return finishWithoutMutation();
      }

      const parsed = parseGridEventDraft(patchedDraft);
      if (!(parsed.ok && parsed.mode === "edit")) {
        return finishWithoutMutation();
      }

      if (
        sourceEvent.providerManaged === true &&
        !eventSchedulesEqual(sourceEvent.schedule, parsed.input.schedule)
      ) {
        showErrorToast(
          "This event's time follows your calendar provider and can't be moved in Compass.",
        );
        return finishWithoutMutation();
      }

      const started = replace(
        {
          id: parsed.eventId,
          input: nextCalendarId
            ? { ...parsed.input, calendarId: nextCalendarId }
            : parsed.input,
          scopeAsk,
        },
        callbacks,
      );
      if (!started) return finishWithoutMutation();
      return true;
    },
    [replace, queryClient],
  );

  return update;
}
