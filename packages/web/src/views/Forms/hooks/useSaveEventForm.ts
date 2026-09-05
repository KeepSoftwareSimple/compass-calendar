import { useCallback, useMemo, useState } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type CreateEventInput } from "@core/types/event-command.contracts";
import { providerDisplayName } from "@core/types/sync/identity.contracts";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { canInviteOnCalendar } from "@web/calendars/calendar.util";
import { useDefaultTargetCalendar } from "@web/calendars/useDefaultTargetCalendar";
import { RecurringEventUpdateScope } from "@web/common/types/web.event.types";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  gridDraftGuestsChanged,
  parseGridEventDraft,
  withoutGuestEdit,
} from "@web/events/grid-event-draft.adapter";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import { toRecurrenceScope } from "@web/events/recurrence/recurrence-scope";
import { useCloseEventForm } from "@web/views/Forms/hooks/useCloseEventForm";

type InvitationIntentValue = NonNullable<CreateEventInput["invitation"]>;

/**
 * Live "Send invitation emails?" decision for a save whose guest set changed:
 * Send maps to invitation "all", Don't send to "none", Cancel abandons the
 * save (the form stays open with the draft intact). Null when no save is
 * waiting on the choice.
 */
export type EventInvitationPrompt = {
  onSend: () => void;
  onDontSend: () => void;
  onCancel: () => void;
  hostLabel: string;
} | null;

const INVITATION_HOST_LABEL: Record<Calendar["provider"], string> = {
  google: providerDisplayName("google"),
  microsoft: providerDisplayName("microsoft"),
  apple: providerDisplayName("apple"),
  local: "Your calendar",
};

export function useSaveEventForm() {
  const closeEventForm = useCloseEventForm();
  const { create, replace } = useEventMutations();
  const { data: calendars } = useCalendarsQuery();
  const defaultTargetCalendarId = useDefaultTargetCalendar(calendars ?? [])?.id;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingInvitationSave, setPendingInvitationSave] = useState<{
    draft: GridEventDraft;
    applyTo: RecurringEventUpdateScope;
  } | null>(null);

  const clearFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  // Belt behind the editor's own render gates: a guest edit that could never
  // deliver is dropped back to preserve semantics instead of submitting a
  // command sync/backend will refuse. The UI cannot reach these states — the
  // editor only renders on writable calendars that can invite attendees, and
  // a guest-changed recurring edit is saved as "all" automatically, whether
  // it started from the series base or from one occurrence — so this only
  // defends replayed or hand-built drafts.
  const normalizeGuestEdit = useCallback(
    (
      draft: GridEventDraft,
      applyTo: RecurringEventUpdateScope,
    ): GridEventDraft => {
      if (draft.values.attendees === undefined) return draft;
      // A touched-but-unchanged guest list is not an edit: omit attendees so
      // the payload stays byte-identical to an untouched save and no
      // invitation prompt appears.
      if (!gridDraftGuestsChanged(draft)) return withoutGuestEdit(draft);

      if (draft.kind === "edit") {
        // Sync refuses guest replacements at scope "this"/"thisAndFollowing"
        // (per-occurrence guest lists have no v1 semantics) — recurring
        // guest edits are series-wide only.
        const isRecurring = draft.source.recurrence.kind !== "single";
        if (isRecurring && toRecurrenceScope(applyTo) !== "all") {
          console.warn(
            "[useSaveEventForm] dropped guest edit: recurring guest edits apply to the whole series only",
          );
          return withoutGuestEdit(draft);
        }
        return draft;
      }

      // Create: guests only deliver to a writable calendar that can invite
      // (ATTENDEES_UNSUPPORTED backstop server-side).
      const calendarId = draft.values.calendarId ?? defaultTargetCalendarId;
      const calendar = calendars?.find((entry) => entry.id === calendarId);
      if (!canInviteOnCalendar(calendar)) {
        console.warn(
          "[useSaveEventForm] dropped guest edit: target calendar cannot deliver a guest list",
        );
        return withoutGuestEdit(draft);
      }
      return draft;
    },
    [calendars, defaultTargetCalendarId],
  );

  const commitSave = useCallback(
    (
      draft: GridEventDraft,
      applyTo: RecurringEventUpdateScope,
      invitation?: InvitationIntentValue,
    ) => {
      if (draft.kind === "create") {
        // Respects a calendar the user explicitly chose via CalendarSelect;
        // only an untouched draft (calendarId still null) falls back to the
        // default target calendar.
        const calendarId = draft.values.calendarId ?? defaultTargetCalendarId;
        if (!calendarId) {
          setFieldErrors({ calendarId: "Calendar is required" });
          return;
        }

        const parsed = parseGridEventDraft({
          ...draft,
          values: { ...draft.values, calendarId },
        });

        if (!parsed.ok) {
          setFieldErrors(parsed.fieldErrors);
          return;
        }

        if (parsed.mode === "create") {
          clearFieldErrors();
          // Reuse the draft's client id (or mint one) so the optimistic card
          // shares identity with the draft. Close then focuses that id: a
          // newly minted create id would miss the card and dump Tab onto
          // the month picker.
          const id =
            parsed.input.id ?? EventIdSchema.parse(createObjectIdString());
          const input =
            invitation === undefined
              ? { ...parsed.input, id }
              : { ...parsed.input, invitation, id };
          // Closing via the callback (not after `create` returns) keeps the draft
          // card mounted until the optimistic insert exists, so the saved card
          // replaces it in one commit instead of flashing empty.
          create(input, { onOptimisticApplied: () => closeEventForm(id) });
        }
        return;
      }

      const scope = toRecurrenceScope(applyTo);
      const parsed = parseGridEventDraft({
        ...draft,
        values: { ...draft.values, scope },
      });

      if (!parsed.ok) {
        setFieldErrors(parsed.fieldErrors);
        return;
      }

      if (parsed.mode === "edit") {
        clearFieldErrors();
        // Same as create: keep the draft mounted until the optimistic replace
        // exists so the grid never paints a frame with the pre-edit color.
        replace(
          {
            id: parsed.eventId,
            input:
              invitation === undefined
                ? parsed.input
                : { ...parsed.input, invitation },
          },
          { onOptimisticApplied: closeEventForm },
        );
      }
    },
    [
      defaultTargetCalendarId,
      clearFieldErrors,
      closeEventForm,
      create,
      replace,
    ],
  );

  const saveEventForm = useCallback(
    (
      draft: GridEventDraft | null,
      applyTo: RecurringEventUpdateScope = RecurringEventUpdateScope.THIS_EVENT,
    ) => {
      if (!draft) {
        clearFieldErrors();
        return closeEventForm();
      }

      const normalized = normalizeGuestEdit(draft, applyTo);

      // A membership-changing guest edit needs the save-time invitation
      // choice first — the host emails the guests itself via sendUpdates, so
      // this is the one moment the user decides whether it should.
      if (gridDraftGuestsChanged(normalized)) {
        setPendingInvitationSave({ draft: normalized, applyTo });
        return;
      }

      commitSave(normalized, applyTo);
    },
    [clearFieldErrors, closeEventForm, commitSave, normalizeGuestEdit],
  );

  const invitationPrompt: EventInvitationPrompt = useMemo(() => {
    if (!pendingInvitationSave) return null;
    const { draft, applyTo } = pendingInvitationSave;
    const calendarId =
      draft.kind === "create"
        ? (draft.values.calendarId ?? defaultTargetCalendarId)
        : draft.source.calendarId;
    const calendar = calendars?.find((entry) => entry.id === calendarId);
    const resolve = (invitation: InvitationIntentValue) => {
      setPendingInvitationSave(null);
      commitSave(draft, applyTo, invitation);
    };
    return {
      onSend: () => resolve("all"),
      onDontSend: () => resolve("none"),
      onCancel: () => setPendingInvitationSave(null),
      hostLabel: INVITATION_HOST_LABEL[calendar?.provider ?? "local"],
    };
  }, [calendars, commitSave, defaultTargetCalendarId, pendingInvitationSave]);

  return { saveEventForm, fieldErrors, clearFieldErrors, invitationPrompt };
}
