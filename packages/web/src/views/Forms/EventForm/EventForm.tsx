import { MapPinIcon, UsersIcon } from "@phosphor-icons/react";
import classNames from "classnames";
import fastDeepEqual from "fast-deep-equal/react";
import type React from "react";
import {
  type KeyboardEvent,
  memo,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type CalendarId } from "@core/types/domain-primitives";
import { type AttendeeInput } from "@core/types/event-attendance.contracts";
import dayjs from "@core/util/date/dayjs";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { canInviteOnCalendar } from "@web/calendars/calendar.util";
import {
  isEventReadOnly,
  useCalendarLookup,
} from "@web/calendars/useCalendarLookup";
import { useDefaultTargetCalendar } from "@web/calendars/useDefaultTargetCalendar";
import { ID_EVENT_FORM } from "@web/common/constants/web.constants";
import { useEventPalette } from "@web/common/styles/theme.util";
import { type SelectOption } from "@web/common/types/component.types";
import { Categories_Event } from "@web/common/types/web.event.types";
import {
  getTimeOptionByValue,
  mapToBackend,
  tryMapToBackend,
} from "@web/common/utils/datetime/web.date.util";
import { getVisibleGridStartMinute } from "@web/common/utils/draft/draft.util";
import {
  isComboboxInteraction,
  isDeleteTextEditingTarget,
  shouldDeferEnterToTarget,
} from "@web/common/utils/form/form.util";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { DescriptionEditor } from "@web/components/DescriptionEditor/DescriptionEditor";
import {
  Focusable,
  INPUT_RESET_CLASSNAME,
} from "@web/components/Focusable/Focusable";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  patchGridDraftFields,
  patchGridDraftScheduleDates,
  replaceGridDraftSchedule,
} from "@web/events/grid-event-draft.adapter";
import { BUSY_EVENT_TITLE } from "@web/events/queries/event.view-model";
import { useEventById } from "@web/events/queries/useEventById";
import { FormDigitHintOverlay } from "@web/shortcuts/form-digit-jump/FormDigitHintOverlay";
import { useFormDigitJumpShortcut } from "@web/shortcuts/form-digit-jump/useFormDigitJumpShortcut";
import { keyboardKey } from "@web/shortcuts/is-bare-letter-key";
import { KEYMAP } from "@web/shortcuts/keymap";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";
import { AttendeeField } from "@web/views/Forms/EventForm/AttendeeField/AttendeeField";
import { EnableContactSuggestionsNudge } from "@web/views/Forms/EventForm/AttendeeField/EnableContactSuggestionsNudge";
import { useContactSuggestions } from "@web/views/Forms/EventForm/AttendeeField/useContactSuggestions";
import {
  attendeeStatusByEmail,
  formatAttendeeRsvpTally,
  statusForEmail,
} from "@web/views/Forms/EventForm/attendee-rsvp";
import { CalendarSelect } from "@web/views/Forms/EventForm/CalendarSelect/CalendarSelect";
import { DateControlsSection } from "@web/views/Forms/EventForm/DateControlsSection/DateControlsSection/DateControlsSection";
import { getFormDates } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/form.datetime.util";
import { RecurrenceSection } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/RecurrenceSection";
import { DiscardUnsavedChangesDialog } from "@web/views/Forms/EventForm/DiscardUnsavedChangesDialog";
import { EventColorPicker } from "@web/views/Forms/EventForm/EventColorPicker/EventColorPicker";
import { EventDetailsSection } from "@web/views/Forms/EventForm/EventDetailsSection";
import { FormActionsRow } from "@web/views/Forms/EventForm/FormActionsRow";
import { RsvpControl } from "@web/views/Forms/EventForm/RsvpControl";
import { SaveSection } from "@web/views/Forms/EventForm/SaveSection/SaveSection";
import {
  type GridEventFormProps,
  type SetEventFormSchedule,
} from "@web/views/Forms/EventForm/types";
import { EventFormShell } from "@web/views/Forms/EventFormShell";
import { useEscapeToCloseForm } from "@web/views/Forms/hooks/useEscapeToCloseForm";

const EVENT_FORM_PLAIN_HOTKEY_OPTIONS = {
  enabled: true,
  ignoreInputs: false,
} as const;

const EVENT_FORM_TITLE_ID = "event-form-title";
const EVENT_FORM_LOCATION_ID = "event-form-location";
const EVENT_FORM_ATTENDEES_ID = "event-form-attendees";
const EVENT_FORM_DESCRIPTION_ID = "event-form-description";
const EVENT_FORM_CALENDAR_ID = "event-form-calendar";
const EVENT_FORM_COLOR_ID = "event-form-color";
const EVENT_FORM_SCHEDULE_ID = "event-form-schedule";
const EVENT_FORM_RECURRENCE_ID = "event-form-recurrence";

const eventFormErrorId = (field: string) =>
  `event-form-error-${field.replaceAll(".", "-")}`;

// DOM / reading order in the form: title → schedule → recurrence → calendar.
const FIELD_CONTROL_FOCUS_ORDER = [
  "content.title",
  "title",
  "start",
  "end",
  "timeZone",
  "recurrence",
  "calendarId",
] as const;

const controlIdForFieldError = (field: string): string | null => {
  switch (field) {
    case "calendarId":
      return EVENT_FORM_CALENDAR_ID;
    case "start":
    case "end":
    case "timeZone":
      return EVENT_FORM_SCHEDULE_ID;
    case "recurrence":
      return EVENT_FORM_RECURRENCE_ID;
    case "content.title":
    case "title":
      return EVENT_FORM_TITLE_ID;
    default:
      return null;
  }
};

/**
 * Subtle raised surface grouping related fields on the sidebar's translucent
 * panel background — same recipe as CommandPalette rows / c-button-secondary.
 */
const FormCard = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-2.5 rounded-md bg-surface-overlay p-3">
    {children}
  </div>
);

const mapsUrlForLocation = (location: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

interface EventFormDateTimeState {
  displayEndDate: Date;
  endTime: SelectOption<string>;
  selectedEndDate: Date;
  selectedStartDate: Date;
  sourceEndDate: string;
  sourceStartDate: string;
  startTime: SelectOption<string>;
}

const createDateTimeState = (
  sourceStartDate: string,
  sourceEndDate: string,
): EventFormDateTimeState => {
  const dt = getFormDates(sourceStartDate, sourceEndDate);

  return {
    displayEndDate: dayjs(dt.displayEndDate).toDate(),
    endTime: dt.endTime,
    selectedEndDate: dt.endDate,
    selectedStartDate: dt.startDate,
    sourceEndDate,
    sourceStartDate,
    startTime: dt.startTime,
  };
};

const resolveDateTimeState = (
  state: EventFormDateTimeState,
  sourceStartDate: string,
  sourceEndDate: string,
) => {
  if (
    state.sourceStartDate === sourceStartDate &&
    state.sourceEndDate === sourceEndDate
  ) {
    return state;
  }

  return createDateTimeState(sourceStartDate, sourceEndDate);
};

const handleEventFormDelete = ({
  isDraft,
  onClose,
  onDelete,
}: {
  isDraft: boolean;
  onClose: () => void;
  onDelete: () => void;
}) => {
  if (isDraft) {
    onClose();
    return;
  }

  onDelete();
};

const DEFAULT_TIMED_START_HOUR = 9; // fallback when the grid can't be measured

const scheduleDateStrings = (draft: GridEventDraft) => {
  const { schedule } = draft.values;

  if (schedule.kind === "allDay") {
    return {
      startDate: dayjs(schedule.start).toYearMonthDayString(),
      endDate: dayjs(schedule.end).toYearMonthDayString(),
    };
  }

  return {
    startDate: dayjs(schedule.start).format(),
    endDate: dayjs(schedule.end).format(),
  };
};

export const EventForm: React.FC<GridEventFormProps> = memo(
  ({
    draft,
    fieldErrors,
    onClose: _onClose,
    onDelete,
    onSubmit,
    onDuplicate,
    setDraft,
    isDraft,
    isExistingEvent,
    ...props
  }) => {
    // An occurrence's own recurrence pointer carries no rule (only the
    // series base does — see grid-event-draft.adapter.ts), so resolve the
    // base from the cache and thread its rules through RecurrenceSection.
    const seriesBase = useEventById(
      draft.kind === "edit" && draft.source.recurrence.kind === "occurrence"
        ? draft.source.recurrence.seriesId
        : undefined,
    );
    const seriesRules =
      seriesBase?.recurrence.kind === "series"
        ? seriesBase.recurrence.rules
        : undefined;

    const { title, description, location, color } = draft.values;
    const { base: eventColor } = useEventPalette(color ?? undefined);
    const category =
      draft.values.schedule.kind === "allDay"
        ? Categories_Event.ALLDAY
        : Categories_Event.TIMED;
    // A6: an existing event's calendar is display-only here, never a move
    // control - draft.source.calendarId is the only calendar an edit draft
    // can show.
    const calendarLookup = useCalendarLookup();
    const originalCalendarName =
      draft.kind === "edit"
        ? (calendarLookup.get(draft.source.calendarId)?.name ??
          "Unknown calendar")
        : null;
    // Only an "edit" draft can be read-only - CalendarSelect only offers
    // writable calendars to a "create"/duplicate draft (packet 08 step 8).
    // isBusy comes straight off the source event's real content, not the
    // draft's `values.title` (which stays "" for a busy source - see
    // editGridEventDraft) - "Busy" below is a display-only override, never
    // a value that could round-trip through a save.
    const isBusy =
      draft.kind === "edit" && draft.source.content.kind === "busy";
    const isReadOnly =
      draft.kind === "edit" &&
      isEventReadOnly(calendarLookup, draft.source.calendarId, isBusy);
    const displayTitle = isBusy ? BUSY_EVENT_TITLE : title;
    // Read-only, provider-sourced fields live on the source event's content,
    // never on draft.values (EditableContentSchema doesn't carry them) - a
    // create draft has no source event, and a busy source carries none of
    // this either.
    const sourceDetails =
      draft.kind === "edit" && draft.source.content.kind === "details"
        ? draft.source.content
        : undefined;
    // Cache-backed view of the same source event (WP-08): an optimistic RSVP
    // patches the query cache, and reading it live here is what makes the
    // user's own status dot (and the segmented control's selection) update
    // immediately — draft.source is a snapshot and never re-renders. Other
    // attendees' RSVP changes arriving via SSE update through this same
    // read. Falls back to the snapshot while the event is not cached.
    const liveSource = useEventById(
      draft.kind === "edit" ? draft.source.id : undefined,
    );
    const rsvpSource =
      draft.kind === "edit" ? (liveSource ?? draft.source) : null;
    const liveDetails =
      rsvpSource?.content.kind === "details" ? rsvpSource.content : undefined;
    // Attendee-editor gate (WP-04): guests are editable everywhere the whole
    // write path can deliver them — a writable calendar that can invite and an
    // event the user organizes. Repeating events included: sync refuses
    // per-occurrence guest replacements, so a guest change on any instance
    // is saved series-wide (resolveRecurrenceScopeDecision widens the whole
    // save to "all"), and the field says so.
    const { data: allCalendars } = useCalendarsQuery();
    const defaultTargetCalendar = useDefaultTargetCalendar(allCalendars ?? []);
    const attendeeCalendar =
      draft.kind === "create"
        ? draft.values.calendarId
          ? calendarLookup.get(draft.values.calendarId)
          : defaultTargetCalendar
        : calendarLookup.get(draft.source.calendarId);
    // The host auto-sets the organizer to the creating account, so "the user
    // organizes this event" is organizer-email == calendar-account-email.
    // A missing organizer means Compass created the event on this account
    // (organizes it); a missing account email fails closed — sync refuses
    // non-organizer guest edits anyway, so don't offer the editor.
    const organizesEvent =
      draft.kind === "create" ||
      !sourceDetails?.organizer ||
      (attendeeCalendar?.accountEmail !== undefined &&
        sourceDetails.organizer.email.toLowerCase() ===
          attendeeCalendar.accountEmail.toLowerCase());
    const showAttendeeEditor =
      !isReadOnly && canInviteOnCalendar(attendeeCalendar) && organizesEvent;
    const guestEditIsSeriesWide =
      draft.kind === "edit" && draft.source.recurrence.kind !== "single";
    // RSVP gate (WP-08): show Going / Maybe / Decline when the calendar's
    // connected account email appears in the attendee list (organizer
    // included — organizers can answer their own event). Hidden when self is
    // not an attendee or the event is local (no provider account email).
    // Deliberately NOT gated on writability: answering an invitation is
    // allowed on viewer-access calendars.
    const rsvpAccountEmail = attendeeCalendar?.accountEmail;
    const showRsvpControl =
      rsvpSource !== null &&
      rsvpAccountEmail !== undefined &&
      (liveDetails?.attendees ?? []).some(
        (attendee) =>
          attendee.email.toLowerCase() === rsvpAccountEmail.toLowerCase(),
      );
    // Contact suggestions (WP-06): live when a connected account granted the
    // optional contacts scopes; otherwise the field is a raw email input and
    // the combobox footer may carry the occasional enable-contacts nudge.
    const { canSuggestContacts, suggestionSource: contactSuggestionSource } =
      useContactSuggestions();
    // Untouched drafts show the source event's guests as chips; a touched
    // draft owns its membership in values.attendees (present = replace).
    const attendeeChips: readonly AttendeeInput[] =
      draft.values.attendees ??
      (sourceDetails?.attendees ?? []).map(({ email, displayName }) => ({
        email,
        displayName,
      }));
    const attendeeRsvpByEmail = attendeeStatusByEmail(
      liveDetails?.attendees ?? sourceDetails?.attendees,
    );
    const attendeeChipTally =
      attendeeChips.length === 0
        ? null
        : formatAttendeeRsvpTally(
            attendeeChips.map((chip) =>
              statusForEmail(attendeeRsvpByEmail, chip.email),
            ),
          );
    const latestDraftRef = useRef(draft);
    const { startDate: eventStartDate, endDate: eventEndDate } =
      scheduleDateStrings(draft);

    /********
     * State
     ********/
    const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
    const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
    const [dateTimeState, setDateTimeState] = useState<EventFormDateTimeState>(
      () => createDateTimeState(eventStartDate, eventEndDate),
    );

    const currentDateTimeState = useMemo(
      () => resolveDateTimeState(dateTimeState, eventStartDate, eventEndDate),
      [dateTimeState, eventEndDate, eventStartDate],
    );
    const {
      displayEndDate,
      endTime,
      selectedEndDate,
      selectedStartDate,
      startTime,
    } = currentDateTimeState;

    const updateDateTimeState = useCallback(
      (
        field: Partial<
          Omit<EventFormDateTimeState, "sourceStartDate" | "sourceEndDate">
        >,
      ) => {
        setDateTimeState((state) => {
          const resolvedState = resolveDateTimeState(
            state,
            eventStartDate,
            eventEndDate,
          );
          const nextState = { ...resolvedState, ...field };

          if (fastDeepEqual(nextState, state)) {
            return state;
          }

          if (fastDeepEqual(nextState, resolvedState)) {
            return resolvedState;
          }

          return nextState;
        });
      },
      [eventEndDate, eventStartDate],
    );

    const setStartTime = useCallback(
      (value: SelectOption<string>) =>
        updateDateTimeState({ startTime: value }),
      [updateDateTimeState],
    );
    const setEndTime = useCallback(
      (value: SelectOption<string>) => updateDateTimeState({ endTime: value }),
      [updateDateTimeState],
    );
    const setSelectedStartDate = useCallback(
      (value: Date) => updateDateTimeState({ selectedStartDate: value }),
      [updateDateTimeState],
    );
    const setSelectedEndDate = useCallback(
      (value: Date) => updateDateTimeState({ selectedEndDate: value }),
      [updateDateTimeState],
    );
    const setDisplayEndDate = useCallback(
      (value: Date) => updateDateTimeState({ displayEndDate: value }),
      [updateDateTimeState],
    );

    const setLatestDraft = useCallback(
      (nextDraft: SetStateAction<GridEventDraft | null>) => {
        const resolvedDraft =
          typeof nextDraft === "function"
            ? nextDraft(latestDraftRef.current)
            : nextDraft;

        if (resolvedDraft) {
          latestDraftRef.current = resolvedDraft;
        }

        setDraft(resolvedDraft);
      },
      [setDraft],
    );

    // Only a "create" draft (new or duplicate) can target a calendar; an
    // "edit" draft's calendar is fixed (A6) and CalendarSelect isn't shown
    // for it.
    const onSelectCalendar = useCallback(
      (calendarId: CalendarId) => {
        setLatestDraft((current) => {
          if (!current || current.kind !== "create") return current;
          return { ...current, values: { ...current.values, calendarId } };
        });
      },
      [setLatestDraft],
    );

    const patchDraftFields = useCallback(
      (
        patch: Partial<
          Pick<
            GridEventDraft["values"],
            "title" | "description" | "location" | "color" | "attendees"
          >
        >,
      ) => {
        setLatestDraft((current) => {
          if (!current) return current;
          return patchGridDraftFields(current, patch);
        });
      },
      [setLatestDraft],
    );

    const onSetScheduleField: SetEventFormSchedule = useCallback(
      (patch) => {
        setLatestDraft((current) => {
          if (!current) return current;
          return patchGridDraftScheduleDates(current, patch);
        });
      },
      [setLatestDraft],
    );

    useEffect(() => {
      latestDraftRef.current = draft;
    }, [draft]);

    /***********
     * Handlers
     **********/
    const onChangeTitle = (e: React.ChangeEvent<HTMLInputElement>) => {
      patchDraftFields({ title: e.target.value });
    };

    const onChangeLocation = (e: React.ChangeEvent<HTMLInputElement>) => {
      patchDraftFields({ location: e.target.value });
    };

    const onClose = useCallback(() => {
      // Defer past the current event turn so menu/Escape handlers finish
      // before the form unmounts — without an arbitrary delay.
      queueMicrotask(_onClose);
    }, [_onClose]);

    const onDeleteEvent = useCallback(() => {
      handleEventFormDelete({ isDraft, onClose, onDelete });
    }, [isDraft, onClose, onDelete]);

    const onDuplicateEvent = useCallback(() => {
      onDuplicate?.(draft);
      onClose();
    }, [onDuplicate, onClose, draft]);

    const handleIgnoredKeys = (e: KeyboardEvent) => {
      // Ignores certain keys and key combinations to prevent default behavior.
      // Allows some of them to be used as hotkeys

      if (e.key === "Backspace" || e.key === "Delete") {
        e.stopPropagation();
      }

      if ((e.metaKey || e.ctrlKey) && keyboardKey(e).toLowerCase() === "<") {
        e.preventDefault();
      }

      if ((e.metaKey || e.ctrlKey) && keyboardKey(e).toLowerCase() === "d") {
        e.preventDefault();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
      }
    };

    const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (
        isDraft &&
        !isExistingEvent &&
        e.key === "Enter" &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        onSubmitForm();
        return;
      }

      handleIgnoredKeys(e);
    };

    const onSubmitForm = () => {
      // Belt for the read-only gate above: the Save button doesn't render,
      // but Enter/Mod+Enter shortcuts below call this directly regardless
      // of what's on screen, so the block has to live here too (packet 08
      // step 8).
      if (isReadOnly) return;

      const draftToSubmit = latestDraftRef.current;
      const isAllDay = draftToSubmit.values.schedule.kind === "allDay";
      const selectedDateTimes = {
        startDate: selectedStartDate,
        startTime,
        endDate: selectedEndDate,
        endTime,
        isAllDay,
      };

      const mapped = tryMapToBackend(selectedDateTimes);
      if (!mapped.ok) {
        showErrorToast(
          "uff-dah, looks like you got the start & end times mixed up",
        );
        return;
      }
      const schedule = mapped.schedule;
      const start = dayjs(schedule.start).toDate();
      const end = dayjs(schedule.end).toDate();

      if (dayjs(start).isAfter(dayjs(end))) {
        showErrorToast(
          "uff-dah, looks like you got the start & end times mixed up",
        );
        return;
      }

      const withSchedule = replaceGridDraftSchedule(
        draftToSubmit,
        schedule.kind === "allDay"
          ? { kind: "allDay", start, end }
          : { kind: "timed", start, end, timeZone: schedule.timeZone },
      );

      shortcutHintProgressActions.demonstrate("save-draft");
      onSubmit(withSchedule);
    };

    const onToggleAllDay = (isAllDay: boolean) => {
      const currentDraft = latestDraftRef.current;
      const isCurrentlyAllDay = currentDraft.values.schedule.kind === "allDay";

      if (isAllDay === isCurrentlyAllDay) return;

      if (isAllDay) {
        const endsAtMidnight = dayjs(currentDraft.values.schedule.end).isSame(
          dayjs(currentDraft.values.schedule.end).startOf("day"),
        );
        const schedule = mapToBackend({
          startDate: selectedStartDate,
          startTime,
          endDate: endsAtMidnight
            ? selectedEndDate
            : dayjs(selectedEndDate).add(1, "day").toDate(),
          endTime,
          isAllDay: true,
        });

        if (schedule.kind !== "allDay") return;

        setLatestDraft(
          replaceGridDraftSchedule(currentDraft, {
            kind: "allDay",
            start: dayjs(schedule.start).toDate(),
            end: dayjs(schedule.end).toDate(),
          }),
        );
        return;
      }

      const startMinute =
        getVisibleGridStartMinute() ?? DEFAULT_TIMED_START_HOUR * 60;
      const timedStart = dayjs(selectedStartDate)
        .startOf("day")
        .add(startMinute, "minute");
      const timedEnd = timedStart.add(1, "hour");
      const nextStartTime = getTimeOptionByValue(timedStart);
      const nextEndTime = getTimeOptionByValue(timedEnd);
      const schedule = mapToBackend({
        startDate: timedStart.toDate(),
        startTime: nextStartTime,
        endDate: timedEnd.toDate(),
        endTime: nextEndTime,
        isAllDay: false,
      });

      if (schedule.kind !== "timed") return;

      updateDateTimeState({
        displayEndDate: timedStart.toDate(),
        endTime: nextEndTime,
        selectedEndDate: timedEnd.toDate(),
        selectedStartDate: timedStart.toDate(),
        startTime: nextStartTime,
      });
      setLatestDraft(
        replaceGridDraftSchedule(currentDraft, {
          kind: "timed",
          start: dayjs(schedule.start).toDate(),
          end: dayjs(schedule.end).toDate(),
          timeZone: schedule.timeZone,
        }),
      );
    };

    const dateTimeSectionProps = {
      displayEndDate,
      draft,
      category,
      endTime,
      isEndDatePickerOpen,
      isStartDatePickerOpen,
      onSetScheduleField,
      selectedEndDate,
      selectedStartDate,
      setEndTime,
      setSelectedEndDate,
      setSelectedStartDate,
      setStartTime,
      startTime,
      setDisplayEndDate,
      setIsEndDatePickerOpen,
      setIsStartDatePickerOpen,
      setDraft: setLatestDraft,
    };

    const recurrenceSectionProps = {
      draft,
      setDraft: setLatestDraft,
      seriesRules,
    };

    useAppShortcut(
      "Delete",
      (keyboardEvent) => {
        if (isDeleteTextEditingTarget(keyboardEvent)) {
          return;
        }

        // FormActionsRow hides Delete for read-only drafts, but the
        // keyboard shortcut still fires.
        if (isReadOnly) {
          return;
        }

        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        onDeleteEvent();
      },
      EVENT_FORM_PLAIN_HOTKEY_OPTIONS,
    );

    // preventDefault/stopPropagation stay off until we actually submit:
    // TanStack applies those before the callback, so an early return for
    // TipTap/buttons would otherwise swallow native Enter (newline / click).
    useAppShortcut(
      KEYMAP.saveDraft.hotkey,
      (keyboardEvent) => {
        if (isDraft) {
          return;
        }

        if (isComboboxInteraction(keyboardEvent)) {
          return;
        }

        if (shouldDeferEnterToTarget(keyboardEvent)) {
          return;
        }

        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        onSubmitForm();
      },
      {
        ...EVENT_FORM_PLAIN_HOTKEY_OPTIONS,
        preventDefault: false,
        stopPropagation: false,
      },
    );

    // Same handler the Duplicate action button uses, so the key and the
    // button cannot drift on whether the form closes afterwards.
    useAppShortcut(
      "Mod+D",
      (keyboardEvent) => {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        onDuplicateEvent();
      },
      EVENT_FORM_PLAIN_HOTKEY_OPTIONS,
    );

    useAppShortcut(
      "Mod+Enter",
      (e) => {
        e.preventDefault();
        onSubmitForm();
      },
      EVENT_FORM_PLAIN_HOTKEY_OPTIONS,
    );

    const { isConfirmOpen, onCancelConfirm, onDiscardConfirm, requestClose } =
      useEscapeToCloseForm(onClose);

    const { areHintsVisible } = useFormDigitJumpShortcut();

    const titleErrorField = fieldErrors?.["content.title"]
      ? "content.title"
      : fieldErrors?.title
        ? "title"
        : null;
    const titleError = titleErrorField
      ? fieldErrors?.[titleErrorField]
      : undefined;
    const calendarError = fieldErrors?.calendarId;
    const scheduleErrorField = (["start", "end", "timeZone"] as const).find(
      (field) => fieldErrors?.[field],
    );
    const scheduleError = scheduleErrorField
      ? fieldErrors?.[scheduleErrorField]
      : undefined;
    const recurrenceError = fieldErrors?.recurrence;
    const titleErrorDescribedBy = titleErrorField
      ? eventFormErrorId(titleErrorField)
      : undefined;
    const calendarErrorDescribedBy = calendarError
      ? eventFormErrorId("calendarId")
      : undefined;
    const scheduleErrorDescribedBy = scheduleErrorField
      ? eventFormErrorId(scheduleErrorField)
      : undefined;
    const recurrenceErrorDescribedBy = recurrenceError
      ? eventFormErrorId("recurrence")
      : undefined;

    useEffect(() => {
      if (!fieldErrors || Object.keys(fieldErrors).length === 0) return;

      for (const field of FIELD_CONTROL_FOCUS_ORDER) {
        if (!(field in fieldErrors)) continue;
        const controlId = controlIdForFieldError(field);
        if (!controlId) continue;
        const control = document.getElementById(controlId);
        if (control instanceof HTMLElement) {
          control.focus();
          break;
        }
      }
    }, [fieldErrors]);

    return (
      <>
        <EventFormShell
          {...props}
          name={ID_EVENT_FORM}
          onMouseUp={() => {
            if (isStartDatePickerOpen) {
              setIsStartDatePickerOpen(false);
            }

            if (isEndDatePickerOpen) {
              setIsEndDatePickerOpen(false);
            }
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        >
          {/* Scrollable body; the save footer below stays pinned. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-4 [scrollbar-gutter:stable]">
            <FormActionsRow
              isExistingEvent={isExistingEvent}
              isReadOnly={isReadOnly}
              onClose={requestClose}
              onDelete={onDeleteEvent}
              onDuplicate={onDuplicateEvent}
            />

            {/* Focusable with withUnderline is a fragment (input +
              divider). Wrap it so those stack in a box; otherwise they
              become flex siblings of the column body and the 100%-wide
              underline is a separate gap-3 item. */}
            <div className="min-w-0">
              <Focusable
                id={EVENT_FORM_TITLE_ID}
                Component="input"
                className={classNames(
                  INPUT_RESET_CLASSNAME,
                  // w-full: an input's intrinsic size-attribute width would
                  // overflow the sidebar-width form and force horizontal scroll
                  "w-full bg-transparent font-semibold text-xl",
                )}
                autoFocus
                disabled={isReadOnly}
                onChange={onChangeTitle}
                onKeyDown={handleTitleKeyDown}
                placeholder="Title"
                aria-label="Title"
                name="Event Title"
                aria-invalid={titleError ? true : undefined}
                aria-describedby={titleErrorDescribedBy}
                underlineColor={eventColor}
                value={displayTitle}
                withUnderline
              />
            </div>

            {/* Same fieldset mechanism as the title above, covering
              date/recurrence/calendar/description in one wrapper. Its
              display: contents keeps the cards direct flex items of the
              gap-3 body. */}
            <fieldset className="contents" disabled={isReadOnly}>
              <FormCard>
                <fieldset
                  id={EVENT_FORM_SCHEDULE_ID}
                  aria-label="Event schedule"
                  aria-invalid={scheduleError ? true : undefined}
                  aria-describedby={scheduleErrorDescribedBy}
                  tabIndex={scheduleError ? -1 : undefined}
                  className={classNames(
                    "min-w-0 rounded-xs border-0 p-0",
                    scheduleError && "ring-1 ring-error",
                  )}
                >
                  <DateControlsSection
                    dateTimeSectionProps={dateTimeSectionProps}
                    eventCategory={category}
                    onToggleAllDay={onToggleAllDay}
                  />
                </fieldset>

                <fieldset
                  id={EVENT_FORM_RECURRENCE_ID}
                  aria-label="Recurrence"
                  aria-invalid={recurrenceError ? true : undefined}
                  aria-describedby={recurrenceErrorDescribedBy}
                  tabIndex={recurrenceError ? -1 : undefined}
                  className={classNames(
                    "min-w-0 rounded-xs border-0 p-0",
                    recurrenceError && "ring-1 ring-error",
                  )}
                >
                  <RecurrenceSection {...recurrenceSectionProps} />
                </fieldset>
              </FormCard>

              <FormCard>
                {draft.kind === "create" ? (
                  <CalendarSelect
                    id={EVENT_FORM_CALENDAR_ID}
                    onChange={onSelectCalendar}
                    value={draft.values.calendarId}
                    error={calendarError ?? undefined}
                    errorId={calendarErrorDescribedBy}
                  />
                ) : (
                  <p className="text-text-muted text-xs">
                    Calendar: {originalCalendarName}
                  </p>
                )}
                <EventColorPicker
                  id={EVENT_FORM_COLOR_ID}
                  value={color}
                  onChange={(next) => patchDraftFields({ color: next })}
                />
              </FormCard>

              <FormCard>
                <div className="flex items-center gap-2">
                  {location ? (
                    <a
                      href={mapsUrlForLocation(location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open in Google Maps"
                      className="shrink-0 text-text-muted hover:text-text"
                    >
                      <MapPinIcon size={16} />
                    </a>
                  ) : (
                    <MapPinIcon
                      size={16}
                      className="shrink-0 text-text-muted"
                    />
                  )}
                  <Focusable
                    id={EVENT_FORM_LOCATION_ID}
                    Component="input"
                    className={classNames(
                      INPUT_RESET_CLASSNAME,
                      "min-w-0 flex-1 bg-transparent text-sm",
                    )}
                    disabled={isReadOnly}
                    onChange={onChangeLocation}
                    onKeyDown={handleIgnoredKeys}
                    placeholder="Location"
                    aria-label="Location"
                    name="Event Location"
                    value={location}
                  />
                </div>
              </FormCard>

              {showAttendeeEditor && (
                <FormCard>
                  <div className="flex items-start gap-2">
                    <UsersIcon
                      size={16}
                      className="mt-1 shrink-0 text-text-muted"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      {attendeeChipTally && (
                        <p className="text-text-muted text-xs">
                          {attendeeChipTally}
                        </p>
                      )}
                      {guestEditIsSeriesWide && (
                        <p className="text-text-muted text-xs">
                          Guest changes apply to all events in this series.
                        </p>
                      )}
                      <AttendeeField
                        id={EVENT_FORM_ATTENDEES_ID}
                        value={attendeeChips}
                        onChange={(next) =>
                          patchDraftFields({ attendees: next })
                        }
                        statusByEmail={attendeeRsvpByEmail}
                        suggestionSource={contactSuggestionSource}
                        menuFooter={
                          canSuggestContacts ? null : (
                            <EnableContactSuggestionsNudge />
                          )
                        }
                      />
                    </div>
                  </div>
                </FormCard>
              )}

              <FormCard>
                <DescriptionEditor
                  id={EVENT_FORM_DESCRIPTION_ID}
                  resetKey={draft.kind === "edit" ? draft.source.id : "create"}
                  value={description}
                  onChange={(html) => patchDraftFields({ description: html })}
                  editable={!isReadOnly}
                  underlineColor={eventColor}
                  onKeyDown={handleIgnoredKeys}
                />
              </FormCard>
            </fieldset>

            {/* Outside the fieldset (like the details section below): RSVP
              must stay interactive on a read-only calendar. */}
            {showRsvpControl && rsvpSource && rsvpAccountEmail && (
              <RsvpControl event={rsvpSource} accountEmail={rsvpAccountEmail} />
            )}

            {/* Outside the fieldset: read-only display, not an editable
              control, so it stays interactive (the "+N more" toggle) even
              when the event itself is read-only. Renders its own card
              styling and returns null when the event has none of this data.
              Prefers the live cache content so other attendees' RSVP changes
              (SSE) and the user's own optimistic answer paint immediately. */}
            {sourceDetails && (
              <EventDetailsSection
                details={liveDetails ?? sourceDetails}
                hideAttendees={showAttendeeEditor}
              />
            )}

            {isReadOnly && (
              <p role="note" className="text-text-muted text-xs">
                Read-only. You don't have permission to edit this event.
              </p>
            )}
          </div>

          {!isReadOnly && (
            <>
              {fieldErrors && Object.keys(fieldErrors).length > 0 ? (
                <ul
                  className="flex list-none flex-col gap-1 border-border border-t px-4 pt-3 text-error text-xs"
                  role="alert"
                >
                  {Object.entries(fieldErrors).map(([field, message]) => (
                    <li key={field} id={eventFormErrorId(field)}>
                      {message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <SaveSection onSubmit={onSubmitForm} />
            </>
          )}
        </EventFormShell>
        <DiscardUnsavedChangesDialog
          isOpen={isConfirmOpen}
          onCancel={onCancelConfirm}
          onDiscard={onDiscardConfirm}
        />
        <FormDigitHintOverlay visible={areHintsVisible} />
      </>
    );
  },
  fastDeepEqual,
);

EventForm.displayName = "EventForm";
