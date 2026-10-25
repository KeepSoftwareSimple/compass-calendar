import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
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
} from "react";
import { isEventFormFocusFieldVisible } from "@core/event/event-form-field-visibility";
import { EVENT_FORM_TOGGLE_ALL_DAY_HOTKEY } from "@core/shortcuts/binding-keycaps.constants";
import { type EventFormFocusField } from "@core/shortcuts/event-form-focus-field";
import { KEYMAP } from "@core/shortcuts/keymap";
import { CONFERENCE_KIND_LABEL } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type AttendeeInput } from "@core/types/event-attendance.contracts";
import dayjs from "@core/util/date/dayjs";
import { parseBookingEventLinks } from "@web/booking/booking-event-links";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { useCalendarLookup } from "@web/calendars/useCalendarLookup";
import { useDefaultTargetCalendar } from "@web/calendars/useDefaultTargetCalendar";
import {
  ENV_WEB,
  IS_EVENT_SIDEBAR_STAGING_UX,
} from "@web/common/constants/env.constants";
import { ID_EVENT_FORM } from "@web/common/constants/web.constants";
import { useEventPalette } from "@web/common/styles/theme.util";
import { Categories_Event } from "@web/common/types/web.event.types";
import {
  getTimeOptionByValue,
  mapToBackend,
  tryMapToBackend,
} from "@web/common/utils/datetime/web.date.util";
import { getVisibleGridStartMinute } from "@web/common/utils/draft/draft.util";
import {
  focusEventFormField,
  isComboboxInteraction,
  isEditableKeyboardTarget,
  shouldDeferEnterToTarget,
} from "@web/common/utils/form/form.util";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { DescriptionEditor } from "@web/components/DescriptionEditor/DescriptionEditor";
import {
  Focusable,
  INPUT_RESET_CLASSNAME,
} from "@web/components/Focusable/Focusable";
import { Switch } from "@web/components/Switch/Switch";
import {
  attendeeStatusByEmail,
  formatAttendeeRsvpTally,
  statusForEmail,
} from "@web/events/attendee-rsvp";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  calendarFromDraft,
  eventFormFieldVisibilityInputFromDraft,
  visibleFormFieldDigitRows,
} from "@web/events/event-form-field-visibility.util";
import {
  patchGridDraftFields,
  replaceGridDraftSchedule,
  scheduleDatesFromDraft,
  scheduleTimeZoneFromDraft,
} from "@web/events/grid-event-draft.adapter";
import { BUSY_EVENT_TITLE } from "@web/events/queries/event.view-model";
import { useEventById } from "@web/events/queries/useEventById";
import { FormDigitHintOverlay } from "@web/shortcuts/form-digit-jump/FormDigitHintOverlay";
import { useFormDigitJumpShortcut } from "@web/shortcuts/form-digit-jump/useFormDigitJumpShortcut";
import { usePointerFormFieldDigitTeach } from "@web/shortcuts/form-digit-jump/usePointerFormFieldDigitTeach";
import { keyboardKey } from "@web/shortcuts/is-bare-letter-key";
import { useEventFormFocusStore } from "@web/shortcuts/tips/event-form-focus.store";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";
import { AttendeeField } from "@web/views/Forms/EventForm/AttendeeField/AttendeeField";
import { EnableContactSuggestionsNudge } from "@web/views/Forms/EventForm/AttendeeField/EnableContactSuggestionsNudge";
import { useContactSuggestions } from "@web/views/Forms/EventForm/AttendeeField/useContactSuggestions";
import { CalendarSelect } from "@web/views/Forms/EventForm/CalendarSelect/CalendarSelect";
import { copyMeetingLinkUrl } from "@web/views/Forms/EventForm/conference-link.util";
import { DateControlsSection } from "@web/views/Forms/EventForm/DateControlsSection/DateControlsSection/DateControlsSection";
import { getFormDates } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/form.datetime.util";
import { commitFocusedTimePickerDraft } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/TimePicker/timePickerCommitDraft";
import { useOpenSide } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/useOpenSide";
import { RecurrenceSection } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/RecurrenceSection";
import { DiscardUnsavedChangesDialog } from "@web/views/Forms/EventForm/DiscardUnsavedChangesDialog";
import { EventColorPicker } from "@web/views/Forms/EventForm/EventColorPicker/EventColorPicker";
import {
  EVENT_FORM_CONFERENCE_ID,
  EventDetailsSection,
} from "@web/views/Forms/EventForm/EventDetailsSection";
import { eventFormCmdActions } from "@web/views/Forms/EventForm/event-form-cmd.store";
import {
  controlIdForFieldError,
  EVENT_FORM_ATTENDEES_ID,
  EVENT_FORM_CALENDAR_ID,
  EVENT_FORM_COLOR_ID,
  EVENT_FORM_DESCRIPTION_ID,
  EVENT_FORM_LOCATION_ID,
  EVENT_FORM_PLAIN_HOTKEY_OPTIONS,
  EVENT_FORM_RECURRENCE_ID,
  EVENT_FORM_RSVP_ID,
  EVENT_FORM_SCHEDULE_ID,
  EVENT_FORM_TITLE_ID,
  eventFormErrorId,
  FIELD_CONTROL_FOCUS_ORDER,
  mapsUrlForLocation,
} from "@web/views/Forms/EventForm/event-form-field-controls.util";
import {
  FormActionsRow,
  type FormActionsRowHandle,
} from "@web/views/Forms/EventForm/FormActionsRow";
import {
  FORM_CARD_FIELD_INPUT_CLASSNAME,
  FormCardIconRow,
} from "@web/views/Forms/EventForm/FormCardIconRow";
import { LocationField } from "@web/views/Forms/EventForm/LocationField/LocationField";
import { ProviderManagedFieldShield } from "@web/views/Forms/EventForm/ProviderManagedFieldShield";
import {
  providerManagedRecurrenceToast,
  providerManagedScheduleNote,
  providerManagedScheduleToast,
} from "@web/views/Forms/EventForm/provider-managed-field.util";
import { setEventFormProviderManagedFocusGuard } from "@web/views/Forms/EventForm/provider-managed-focus-guard";
import { RsvpControl } from "@web/views/Forms/EventForm/RsvpControl";
import { SaveSection } from "@web/views/Forms/EventForm/SaveSection/SaveSection";
import {
  type GridEventFormProps,
  type OnEventFormScheduleChange,
} from "@web/views/Forms/EventForm/types";
import { useCopyMeetingLinkShortcut } from "@web/views/Forms/EventForm/useCopyMeetingLinkShortcut";
import { EventFormShell } from "@web/views/Forms/EventFormShell";
import { useEscapeToCloseForm } from "@web/views/Forms/hooks/useEscapeToCloseForm";

/**
 * Subtle raised surface grouping related fields on the sidebar's translucent
 * panel background — same recipe as CommandPalette rows / c-button-secondary.
 */
const FormCard = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-2.5 rounded-md bg-surface-overlay p-3">
    {children}
  </div>
);

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
    // Read-only, provider-sourced fields live on the source event's content,
    // never on draft.values (EditableContentSchema doesn't carry them) - a
    // create draft has no source event, and a busy source carries none of
    // this either.
    const sourceDetails =
      draft.kind === "edit" && draft.source.content.kind === "details"
        ? draft.source.content
        : undefined;
    const bookingLinks = sourceDetails
      ? parseBookingEventLinks(sourceDetails.description)
      : null;
    const bookingGuestDisplayName = (() => {
      const guest = sourceDetails?.attendees?.[0];
      if (!guest) return "Guest";
      return guest.displayName?.trim() || guest.email;
    })();
    const formActionsRef = useRef<FormActionsRowHandle>(null);
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
    const meetingLinkUrl =
      (liveDetails ?? sourceDetails)?.conference?.url?.trim() || null;
    // Attendee-editor gate (WP-04): guests are editable everywhere the whole
    // write path can deliver them — a writable calendar that can invite and an
    // event the user organizes. Repeating events included: sync refuses
    // per-occurrence guest replacements, so a guest change on any instance
    // is saved series-wide (resolveRecurrenceScopeDecision widens the whole
    // save to "all"), and the field says so.
    const { data: allCalendars } = useCalendarsQuery();
    const defaultTargetCalendar = useDefaultTargetCalendar(allCalendars ?? []);
    const attendeeCalendar = calendarFromDraft(
      draft,
      calendarLookup,
      defaultTargetCalendar,
    );
    const scheduleManagedToast = providerManagedScheduleToast(attendeeCalendar);
    const recurrenceManagedToast =
      providerManagedRecurrenceToast(attendeeCalendar);
    const fieldVisibilityInput = useMemo(
      () =>
        eventFormFieldVisibilityInputFromDraft(
          draft,
          calendarLookup,
          defaultTargetCalendar,
        ),
      [calendarLookup, defaultTargetCalendar, draft],
    );
    // Only an "edit" draft can be read-only. isBusy comes off the source
    // event's real content, not draft.values.title ("Busy" is display-only).
    const isBusy = fieldVisibilityInput.isBusyContent;
    const isReadOnly = fieldVisibilityInput.isReadOnly;
    const isScheduleLocked = fieldVisibilityInput.isScheduleLocked;
    const showProviderManagedStagingUx =
      IS_EVENT_SIDEBAR_STAGING_UX && isScheduleLocked;
    const displayTitle = isBusy ? BUSY_EVENT_TITLE : title;
    const showBookingFormActions = !isReadOnly && bookingLinks !== null;
    const formDigitRows = useMemo(
      () => visibleFormFieldDigitRows(fieldVisibilityInput),
      [fieldVisibilityInput],
    );
    const isFieldJumpVisible = useCallback(
      (field: EventFormFocusField) =>
        isEventFormFocusFieldVisible(field, fieldVisibilityInput),
      [fieldVisibilityInput],
    );
    const showAttendeeEditor = isFieldJumpVisible("attendees");
    const conferenceKind = fieldVisibilityInput.creatableConferenceKind ?? null;
    const guestEditIsSeriesWide =
      draft.kind === "edit" && draft.source.recurrence.kind !== "single";
    const rsvpAccountEmail = fieldVisibilityInput.calendarAccountEmail;
    const showRsvpControl = isFieldJumpVisible("rsvp");
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
      scheduleDatesFromDraft(draft);
    const scheduleTimeZone = scheduleTimeZoneFromDraft(draft);
    const formDates = getFormDates(
      eventStartDate,
      eventEndDate,
      scheduleTimeZone,
    );
    const selectedStartDate = formDates.startDate;
    const selectedEndDate = formDates.endDate;
    const displayEndDate = dayjs(formDates.displayEndDate).toDate();
    const { startTime, endTime } = formDates;

    /********
     * State
     ********/
    const datePickers = useOpenSide();

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
          if (current?.kind !== "create") return current;
          return { ...current, values: { ...current.values, calendarId } };
        });
      },
      [setLatestDraft],
    );

    // Create-only like onSelectCalendar: the switch never renders on an edit.
    const onCreateConferenceChange = useCallback(
      (createConference: boolean) => {
        setLatestDraft((current) => {
          if (current?.kind !== "create") return current;
          return {
            ...current,
            values: { ...current.values, createConference },
          };
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

    const onScheduleChange: OnEventFormScheduleChange = useCallback(
      (schedule) => {
        setLatestDraft((current) => {
          if (!current) return current;
          const next = replaceGridDraftSchedule(current, schedule);
          latestDraftRef.current = next;
          return next;
        });
      },
      [setLatestDraft],
    );

    useEffect(() => {
      latestDraftRef.current = draft;
    }, [draft]);

    useEffect(() => {
      if (!showProviderManagedStagingUx) {
        setEventFormProviderManagedFocusGuard(null);
        return;
      }

      const toastForField = (field: EventFormFocusField) => {
        if (field === "start" || field === "end") {
          showStatusToast("provider-managed-schedule", scheduleManagedToast);
          return false;
        }
        if (field === "recurrence") {
          showStatusToast(
            "provider-managed-recurrence",
            recurrenceManagedToast,
          );
          return false;
        }
        return true;
      };

      setEventFormProviderManagedFocusGuard(toastForField);
      return () => {
        setEventFormProviderManagedFocusGuard(null);
      };
    }, [
      showProviderManagedStagingUx,
      scheduleManagedToast,
      recurrenceManagedToast,
    ]);

    /***********
     * Handlers
     **********/
    const onChangeTitle = (e: React.ChangeEvent<HTMLInputElement>) => {
      patchDraftFields({ title: e.target.value });
    };

    const onChangeLocation = (nextLocation: string) => {
      patchDraftFields({ location: nextLocation });
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

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        keyboardKey(e).toLowerCase() === "x"
      ) {
        e.preventDefault();
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        keyboardKey(e).toLowerCase() === "e"
      ) {
        e.preventDefault();
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        keyboardKey(e).toLowerCase() === "l"
      ) {
        e.preventDefault();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
      }
    };

    const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      handleIgnoredKeys(e);
    };

    const onSubmitForm = (
      invocationMethod: "keyboard" | "click" = "keyboard",
    ) => {
      // Belt for the read-only gate above: the Save button doesn't render,
      // but Enter/Mod+Enter shortcuts below call this directly regardless
      // of what's on screen, so the block has to live here too (packet 08
      // step 8).
      if (isReadOnly) return;

      const draftToSubmit = latestDraftRef.current;
      const isAllDay = draftToSubmit.values.schedule.kind === "allDay";
      const submitScheduleDates = scheduleDatesFromDraft(draftToSubmit);
      const submitFormDates = getFormDates(
        submitScheduleDates.startDate,
        submitScheduleDates.endDate,
        scheduleTimeZoneFromDraft(draftToSubmit),
      );
      const selectedDateTimes = {
        startDate: submitFormDates.startDate,
        startTime: submitFormDates.startTime,
        endDate: submitFormDates.endDate,
        endTime: submitFormDates.endTime,
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

      shortcutHintProgressActions.demonstrate("save-draft", invocationMethod);
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

        onScheduleChange({
          kind: "allDay",
          start: dayjs(schedule.start).toDate(),
          end: dayjs(schedule.end).toDate(),
        });
        return;
      }

      const startMinute =
        getVisibleGridStartMinute() ?? DEFAULT_TIMED_START_HOUR * 60;
      const timedStart = inEffectiveTimeZone(selectedStartDate)
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

      onScheduleChange({
        kind: "timed",
        start: dayjs(schedule.start).toDate(),
        end: dayjs(schedule.end).toDate(),
        timeZone: schedule.timeZone,
      });
    };

    const scheduleStart =
      draft.values.schedule.kind === "timed"
        ? dayjs(draft.values.schedule.start).toDate()
        : selectedStartDate;
    const scheduleEnd =
      draft.values.schedule.kind === "timed"
        ? dayjs(draft.values.schedule.end).toDate()
        : selectedEndDate;

    const dateTimeSectionProps = {
      datePickers,
      displayEndDate,
      draft,
      endTime,
      onScheduleChange,
      scheduleEnd,
      scheduleStart,
      selectedEndDate,
      selectedStartDate,
      startTime,
    };

    const recurrenceSectionProps = {
      draft,
      setDraft: setLatestDraft,
      seriesRules,
    };

    useAppShortcut(
      "Delete",
      (keyboardEvent) => {
        if (isEditableKeyboardTarget(keyboardEvent)) {
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
      "Mod+Shift+X",
      (keyboardEvent) => {
        if (!showBookingFormActions) return;
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        formActionsRef.current?.triggerCancelShortcut();
      },
      {
        ...EVENT_FORM_PLAIN_HOTKEY_OPTIONS,
        shortcutId: "edit-cancel-meeting",
      },
    );

    useAppShortcut(
      "Mod+Shift+E",
      (keyboardEvent) => {
        if (!showBookingFormActions) return;
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        formActionsRef.current?.triggerRescheduleShortcut();
      },
      {
        ...EVENT_FORM_PLAIN_HOTKEY_OPTIONS,
        shortcutId: "edit-reschedule-meeting",
      },
    );

    useAppShortcut(
      "Mod+Enter",
      (e) => {
        e.preventDefault();
        commitFocusedTimePickerDraft(document.activeElement);
        onSubmitForm();
      },
      { ...EVENT_FORM_PLAIN_HOTKEY_OPTIONS, shortcutId: "edit-save" },
    );

    useAppShortcut(
      EVENT_FORM_TOGGLE_ALL_DAY_HOTKEY,
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isReadOnly || isScheduleLocked) return;
        onToggleAllDay(category !== Categories_Event.ALLDAY);
      },
      {
        ...EVENT_FORM_PLAIN_HOTKEY_OPTIONS,
        preventDefault: true,
        stopPropagation: true,
        shortcutId: "edit-toggle-all-day",
        enabled: !isReadOnly && !isScheduleLocked,
      },
    );

    const { isConfirmOpen, onCancelConfirm, onDiscardConfirm, requestClose } =
      useEscapeToCloseForm(onClose, {
        onEscapeBeforeClose: () =>
          formActionsRef.current?.consumeEscapeForCancelConfirm() ?? false,
      });

    useCopyMeetingLinkShortcut(meetingLinkUrl, !isReadOnly);

    const onSubmitFormRef = useRef(onSubmitForm);
    onSubmitFormRef.current = onSubmitForm;
    const onToggleAllDayRef = useRef(onToggleAllDay);
    onToggleAllDayRef.current = onToggleAllDay;
    const categoryRef = useRef(category);
    categoryRef.current = category;

    useEffect(() => {
      eventFormCmdActions.register({
        handlers: {
          onSave: () => onSubmitFormRef.current("keyboard"),
          onDuplicate: onDuplicateEvent,
          onDelete: onDeleteEvent,
          onClose: requestClose,
          onCopyMeetingLink: () => {
            if (meetingLinkUrl) void copyMeetingLinkUrl(meetingLinkUrl);
          },
          onJumpToActions: () => {
            focusEventFormField("actions");
          },
          onToggleAllDay: () => {
            if (isReadOnly || isScheduleLocked) return;
            onToggleAllDayRef.current(
              categoryRef.current !== Categories_Event.ALLDAY,
            );
          },
          onCancelMeeting: () => {
            formActionsRef.current?.triggerCancelShortcut();
          },
          onRescheduleMeeting: () => {
            formActionsRef.current?.triggerRescheduleShortcut();
          },
        },
        hasMeetingLink: Boolean(meetingLinkUrl),
        isExistingEvent,
        isReadOnly,
        isScheduleLocked,
        showBookingFormActions,
      });

      return () => {
        eventFormCmdActions.clear();
      };
    }, [
      isExistingEvent,
      isReadOnly,
      isScheduleLocked,
      meetingLinkUrl,
      onDeleteEvent,
      onDuplicateEvent,
      requestClose,
      showBookingFormActions,
    ]);

    const { areHintsVisible } = useFormDigitJumpShortcut({
      isFieldVisible: isFieldJumpVisible,
    });
    const { digitFlashField, onFormFocusIn, onFormPointerDown } =
      usePointerFormFieldDigitTeach();
    const syncEventFormFocus = useEventFormFocusStore(
      (state) => state.syncFromDocument,
    );

    useEffect(() => {
      syncEventFormFocus();
      return () => {
        useEventFormFocusStore.setState({
          focusInsideForm: false,
          tabNavigationApplies: false,
        });
      };
    }, [syncEventFormFocus]);

    const onFormFocusCapture = useCallback(
      (event: React.FocusEvent<HTMLElement>) => {
        onFormFocusIn(event);
        syncEventFormFocus();
      },
      [onFormFocusIn, syncEventFormFocus],
    );

    const onFormBlurCapture = useCallback(() => {
      queueMicrotask(() => syncEventFormFocus());
    }, [syncEventFormFocus]);

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
            datePickers.closeAll();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onPointerDown={onFormPointerDown}
          onFocusCapture={onFormFocusCapture}
          onBlurCapture={onFormBlurCapture}
        >
          <div className="sticky top-0 z-10 shrink-0 bg-surface-panel px-4 pt-3 pb-2">
            <FormActionsRow
              ref={formActionsRef}
              bookingLinks={bookingLinks}
              guestDisplayName={bookingGuestDisplayName}
              isExistingEvent={isExistingEvent}
              isReadOnly={isReadOnly}
              onClose={requestClose}
              onDelete={onDeleteEvent}
              onDuplicate={onDuplicateEvent}
            />
          </div>

          {/* Scrollable body; the save footer below stays pinned. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-4 [scrollbar-gutter:stable]">
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
                <ProviderManagedFieldShield
                  active={showProviderManagedStagingUx}
                  message={scheduleManagedToast}
                >
                  <fieldset
                    id={EVENT_FORM_SCHEDULE_ID}
                    aria-label="Event schedule"
                    aria-invalid={scheduleError ? true : undefined}
                    aria-describedby={scheduleErrorDescribedBy}
                    tabIndex={scheduleError ? -1 : undefined}
                    disabled={isScheduleLocked}
                    className={classNames(
                      "min-w-0 rounded-xs border-0 p-0",
                      scheduleError && "ring-1 ring-error",
                    )}
                  >
                    <DateControlsSection
                      dateTimeSectionProps={dateTimeSectionProps}
                      eventCategory={category}
                      onToggleAllDay={onToggleAllDay}
                      showAllDayShortcut={!isScheduleLocked}
                    />
                  </fieldset>
                </ProviderManagedFieldShield>

                <ProviderManagedFieldShield
                  active={showProviderManagedStagingUx}
                  message={recurrenceManagedToast}
                >
                  <fieldset
                    id={EVENT_FORM_RECURRENCE_ID}
                    aria-label="Recurrence"
                    aria-invalid={recurrenceError ? true : undefined}
                    aria-describedby={recurrenceErrorDescribedBy}
                    tabIndex={recurrenceError ? -1 : undefined}
                    disabled={isScheduleLocked}
                    className={classNames(
                      "min-w-0 rounded-xs border-0 p-0",
                      recurrenceError && "ring-1 ring-error",
                    )}
                  >
                    <RecurrenceSection {...recurrenceSectionProps} />
                  </fieldset>
                </ProviderManagedFieldShield>
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
                <FormCardIconRow
                  icon={
                    location ? (
                      <a
                        href={mapsUrlForLocation(location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open in Google Maps"
                        className="text-text-muted hover:text-text"
                      >
                        <MapPinIcon size={16} />
                      </a>
                    ) : (
                      <MapPinIcon size={16} />
                    )
                  }
                >
                  <LocationField
                    id={EVENT_FORM_LOCATION_ID}
                    apiKey={ENV_WEB.GOOGLE_PLACES_API_KEY}
                    className={FORM_CARD_FIELD_INPUT_CLASSNAME}
                    disabled={isReadOnly}
                    onChange={onChangeLocation}
                    onKeyDown={handleIgnoredKeys}
                    value={location}
                  />
                </FormCardIconRow>
                {conferenceKind && draft.kind === "create" && (
                  <FormCardIconRow icon={<VideoCameraIcon size={16} />}>
                    <Switch
                      id={EVENT_FORM_CONFERENCE_ID}
                      checked={draft.values.createConference ?? false}
                      onCheckedChange={onCreateConferenceChange}
                      label={`Add ${CONFERENCE_KIND_LABEL[conferenceKind]}`}
                      labelClassName="text-text-muted"
                      rowClassName="w-full justify-between"
                      shortcutKeys={["="]}
                    />
                  </FormCardIconRow>
                )}
                {showAttendeeEditor && (
                  <FormCardIconRow
                    icon={<UsersIcon size={16} />}
                    className="items-start"
                  >
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
                  </FormCardIconRow>
                )}
              </FormCard>

              <FormCard>
                <DescriptionEditor
                  id={EVENT_FORM_DESCRIPTION_ID}
                  resetKey={draft.kind === "edit" ? draft.source.id : "create"}
                  value={description}
                  onChange={(html) => patchDraftFields({ description: html })}
                  editable={!isReadOnly}
                  underlineColor={eventColor}
                  onKeyDown={handleIgnoredKeys}
                  suppressLinkShortcutHints={showBookingFormActions}
                />
              </FormCard>
            </fieldset>

            {/* Outside the fieldset (like the details section below): RSVP
              must stay interactive on a read-only calendar. */}
            {showRsvpControl && rsvpSource && rsvpAccountEmail && (
              <RsvpControl
                id={EVENT_FORM_RSVP_ID}
                event={rsvpSource}
                accountEmail={rsvpAccountEmail}
              />
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

            {isScheduleLocked && !IS_EVENT_SIDEBAR_STAGING_UX && (
              <p role="note" className="text-text-muted text-xs">
                {providerManagedScheduleNote(attendeeCalendar)}
              </p>
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
              <SaveSection onSubmit={() => onSubmitForm("click")} />
            </>
          )}
        </EventFormShell>
        <DiscardUnsavedChangesDialog
          isOpen={isConfirmOpen}
          onCancel={onCancelConfirm}
          onDiscard={onDiscardConfirm}
        />
        <FormDigitHintOverlay
          digitRows={formDigitRows}
          highlightField={digitFlashField}
          visible={areHintsVisible}
        />
      </>
    );
  },
  fastDeepEqual,
);

EventForm.displayName = "EventForm";
