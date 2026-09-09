import {
  type MutableRefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AdminGetBookingPageResult,
  type AdminPutBookingPageInput,
  BOOKING_MAX_HORIZON_DAYS,
  BOOKING_MAX_MIN_NOTICE_HOURS,
  BOOKING_PLACEHOLDER_CALENDAR_ID,
  type BookingDurationMinutes,
  buildDefaultAdminPutInput,
  isSavedBookingPage,
} from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId, TimeZoneSchema } from "@core/types/domain-primitives";
import { track } from "@web/auth/posthog/track";
import {
  selectGoogleConnectionState,
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { useAppAccess } from "@web/billing/useAppAccess";
import {
  BookingAddressField,
  bookingAddressPrefix,
} from "@web/booking/BookingAddressField";
import { BookingBlockingCalendarsField } from "@web/booking/BookingBlockingCalendarsField";
import { BookingConnectionBanner } from "@web/booking/BookingConnectionBanner";
import { BookingConnectPrompt } from "@web/booking/BookingConnectPrompt";
import { BookingFieldLabel } from "@web/booking/BookingFieldLabel";
import { BookingMoreOptions } from "@web/booking/BookingMoreOptions";
import { BookingNumberField } from "@web/booking/BookingNumberField";
import { BookingSaveBar } from "@web/booking/BookingSaveBar";
import { BookingStatusHeader } from "@web/booking/BookingStatusHeader";
import { BookingTimezoneField } from "@web/booking/BookingTimezoneField";
import { BookingWeeklyHoursEditor } from "@web/booking/BookingWeeklyHoursEditor";
import {
  bookingSaveErrorInline,
  useBookingPageQuery,
  useBookingStatusQuery,
  useSaveBookingPageMutation,
} from "@web/booking/booking.query";
import {
  bookingSlugParseMessage,
  defaultBlockingCalendarIdsForDestination,
  getAvailabilityReadableCalendars,
  isBookingSettingsFormDirty,
  isPlaceholderDestinationCalendar,
  isUnconfiguredBookingPage,
  slugFromAdminBookingPage,
  toBookingPageInput,
  validateBookingForm,
} from "@web/booking/booking.util";
import {
  bookingDestinationConferenceHint,
  formatBookingDestinationOptionLabel,
  resolveBookingConference,
} from "@web/booking/booking-conference.copy";
import { BOOKING_SELECT_CLASS_NAME } from "@web/booking/booking-form.styles";
import {
  type BookingField,
  bookingFieldAttrs,
  focusBookingField,
} from "@web/booking/booking-sequence.fields";
import { BookingSetupWizard } from "@web/booking/setup/BookingSetupWizard";
import {
  nextSetupStep,
  prevSetupStep,
  type SetupStepId,
} from "@web/booking/setup/setup-steps";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import {
  compareCalendars,
  getWritableCalendars,
  groupCalendarsByAccount,
} from "@web/calendars/calendar.util";
import { getLocalCalendarSentinelId } from "@web/calendars/local-calendar.sentinel";
import { useConnectedAccountEmails } from "@web/calendars/useDefaultTargetCalendar";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { DiscardUnsavedChangesDialog } from "@web/views/Forms/EventForm/DiscardUnsavedChangesDialog";

const DURATION_OPTIONS: BookingDurationMinutes[] = [15, 30, 45, 60];

const MORE_OPTIONS_FIELDS = new Set<BookingField>([
  "address",
  "destination",
  "timezone",
  "blocking",
  "notice",
  "horizon",
]);

/** Public URL for a saved page that is currently off. Typed-but-unsaved slugs never qualify. */
function savedMeetingLinkUrl(
  page: AdminGetBookingPageResult | undefined,
): string | null {
  if (!page) return null;
  if (isSavedBookingPage(page)) {
    return page.enabled === true ? null : page.bookingUrl;
  }
  if (page.isConfigured) {
    return `${bookingAddressPrefix(null)}${page.suggestedSlug}`;
  }
  return null;
}

/** Copy the public link, then report whichever of the two outcomes happened. */
const copyBookingLinkThenToast = (
  bookingUrl: string,
  copy: { onCopy: string; onFail: string },
) => {
  void copyText(bookingUrl).then((didCopy) => {
    if (didCopy) {
      track("booking_link_copied", { source: "save" });
    }
    showStatusToast("booking-link-copied", didCopy ? copy.onCopy : copy.onFail);
  });
};

const parseBookingCount = (
  raw: string,
  { min, max }: { min: number; max: number },
): number | null => {
  if (raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
};

const MIN_NOTICE_BOUNDS = { min: 0, max: BOOKING_MAX_MIN_NOTICE_HOURS };
const HORIZON_BOUNDS = { min: 1, max: BOOKING_MAX_HORIZON_DAYS };

const buildInitialForm = (
  page: AdminGetBookingPageResult | undefined,
  effectiveTimeZone: string,
  writableCalendars: Calendar[],
  availabilityCalendars: Calendar[],
): AdminPutBookingPageInput => {
  const base =
    page ?? buildDefaultAdminPutInput(TimeZoneSchema.parse(effectiveTimeZone));

  const destinationCalendarId =
    !isPlaceholderDestinationCalendar(base.destinationCalendarId) &&
    (writableCalendars.some(
      (calendar) => calendar.id === base.destinationCalendarId,
    ) ||
      writableCalendars.length === 0)
      ? base.destinationCalendarId
      : (writableCalendars[0]?.id ?? BOOKING_PLACEHOLDER_CALENDAR_ID);

  const blockingCalendarIds =
    base.blockingCalendarIds.length > 0 &&
    !base.blockingCalendarIds.every(isPlaceholderDestinationCalendar)
      ? base.blockingCalendarIds
      : defaultBlockingCalendarIdsForDestination(
          destinationCalendarId,
          availabilityCalendars,
        );

  const timeZone =
    page && !isUnconfiguredBookingPage(page)
      ? base.timeZone
      : effectiveTimeZone;

  const slug = page ? slugFromAdminBookingPage(page) : undefined;

  return {
    ...toBookingPageInput({
      ...base,
      ...(slug !== undefined ? { slug } : {}),
    }),
    destinationCalendarId,
    blockingCalendarIds,
    timeZone: TimeZoneSchema.parse(timeZone || effectiveTimeZone),
  };
};

interface BookingSettingsSectionProps {
  /**
   * Settings OverlayPanel owns Escape. When this returns true, Settings must
   * not dismiss: the booking form is dirty and the discard dialog is open.
   */
  dismissGuardRef?: MutableRefObject<(() => boolean) | null>;
  /** Close Settings after the host confirms discarding unsaved booking edits. */
  onDiscardUnsaved?: () => void;
}

export function BookingSettingsSection({
  dismissGuardRef,
  onDiscardUnsaved,
}: BookingSettingsSectionProps) {
  const googleConnectionState = useUserMetadataStore(
    selectGoogleConnectionState,
  );
  const connections = useUserMetadataStore(selectSyncConnections);
  const hasHealthyConnection =
    connections.some(
      (connection) => connection.connectionState === "HEALTHY",
    ) || googleConnectionState === "HEALTHY";
  const access = useAppAccess();
  const isReadOnly = access.kind === "server" && access.isReadOnly;
  const effectiveTimeZone = useEffectiveTimeZone();
  const {
    data: calendars = [],
    isPending: calendarsPending,
    refetch: refetchCalendars,
  } = useCalendarsQuery();
  const [hostCalendarsRefetchDone, setHostCalendarsRefetchDone] =
    useState(false);
  const accountEmailOrder = useConnectedAccountEmails();
  const writableCalendars = useMemo(
    () =>
      getWritableCalendars(calendars, {
        hasConnectedAccount: accountEmailOrder.length > 0,
      }).sort(compareCalendars(accountEmailOrder)),
    [accountEmailOrder, calendars],
  );
  const availabilityCalendars = useMemo(
    () =>
      getAvailabilityReadableCalendars(calendars).sort(
        compareCalendars(accountEmailOrder),
      ),
    [accountEmailOrder, calendars],
  );
  const waitingForHostCalendars =
    hasHealthyConnection &&
    writableCalendars.length === 0 &&
    calendars.length === 1 &&
    calendars[0]?.id === getLocalCalendarSentinelId() &&
    !hostCalendarsRefetchDone;

  useEffect(() => {
    if (!hasHealthyConnection || hostCalendarsRefetchDone) return;
    if (writableCalendars.length > 0) {
      setHostCalendarsRefetchDone(true);
      return;
    }
    if (
      calendars.length !== 1 ||
      calendars[0]?.id !== getLocalCalendarSentinelId()
    ) {
      setHostCalendarsRefetchDone(true);
      return;
    }
    void refetchCalendars().finally(() => {
      setHostCalendarsRefetchDone(true);
    });
  }, [
    calendars,
    hasHealthyConnection,
    hostCalendarsRefetchDone,
    refetchCalendars,
    writableCalendars.length,
  ]);

  const { data: serverPage, isPending } = useBookingPageQuery(true);
  const isLiveSavedPage =
    isSavedBookingPage(serverPage) && serverPage.enabled === true;
  const statusQuery = useBookingStatusQuery(isLiveSavedPage);
  const saveMutation = useSaveBookingPageMutation();
  const [form, setForm] = useState<AdminPutBookingPageInput>(() =>
    buildInitialForm(
      undefined,
      effectiveTimeZone,
      writableCalendars,
      availabilityCalendars,
    ),
  );
  const [saveError, setSaveError] = useState<{
    message: string;
    field?: BookingField;
  } | null>(null);
  const [minNoticeText, setMinNoticeText] = useState(() =>
    String(form.minNoticeHours),
  );
  const [horizonText, setHorizonText] = useState(() =>
    String(form.maxHorizonDays),
  );
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStepId | null>(null);
  const setupContinueRef = useRef<HTMLButtonElement>(null);
  const focusSwitchAfterSetupRef = useRef(false);
  // The settings fieldset is disabled while a save is in flight, so focusing
  // from onError is a no-op. Wait until the mutation settles and the field
  // is enabled again.
  useLayoutEffect(() => {
    if (saveMutation.isPending || saveError?.field == null) return;
    focusBookingField(saveError.field);
  }, [saveError, saveMutation.isPending]);
  useLayoutEffect(() => {
    if (!focusSwitchAfterSetupRef.current) return;
    if (serverPage && isUnconfiguredBookingPage(serverPage)) return;
    if (focusBookingField("enabled")) {
      focusSwitchAfterSetupRef.current = false;
    }
  });
  const baselineFormRef = useRef<AdminPutBookingPageInput | null>(null);

  const minNoticeInvalid =
    parseBookingCount(minNoticeText, MIN_NOTICE_BOUNDS) === null;
  const horizonInvalid =
    parseBookingCount(horizonText, HORIZON_BOUNDS) === null;

  // Re-seed only when the server actually answers with a different page.
  // Keying the effect on writableCalendars/effectiveTimeZone as well meant a
  // calendars refetch or a timezone-store change wiped edits mid-typing.
  const seededPageRef = useRef<AdminGetBookingPageResult | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!serverPage || seededPageRef.current === serverPage) return;
    if (setupStep != null) return;
    // The week-view cache can still be the anonymous local calendar after
    // e2e (or a fresh login) flips authenticated. Seeding against that empty
    // writable list sticks a placeholder destination that the identity guard
    // will not correct.
    if (calendarsPending || waitingForHostCalendars) return;
    seededPageRef.current = serverPage;
    const seeded = buildInitialForm(
      serverPage,
      effectiveTimeZone,
      writableCalendars,
      availabilityCalendars,
    );
    setForm(seeded);
    setMinNoticeText(String(seeded.minNoticeHours));
    setHorizonText(String(seeded.maxHorizonDays));
    baselineFormRef.current = seeded;
  }, [
    availabilityCalendars,
    calendarsPending,
    effectiveTimeZone,
    serverPage,
    setupStep,
    waitingForHostCalendars,
    writableCalendars,
  ]);

  // Not ready until the calendars settle and the effect above has consumed
  // this server page. The analytics effect and the render guard must read the
  // same value, or "settings opened" fires against a form the host cannot see.
  const isSeedingForm =
    setupStep == null &&
    (isPending ||
      calendarsPending ||
      waitingForHostCalendars ||
      (serverPage != null && seededPageRef.current !== serverPage));

  useEffect(() => {
    if (isSeedingForm) return;
    if (serverPage == null || !isUnconfiguredBookingPage(serverPage)) return;
    setSetupStep((current) => current ?? "address");
  }, [isSeedingForm, serverPage]);

  const isDirty =
    baselineFormRef.current !== null &&
    isBookingSettingsFormDirty({
      baseline: baselineFormRef.current,
      form,
      horizonText,
      minNoticeText,
    });

  if (dismissGuardRef) {
    dismissGuardRef.current = () => {
      if (setupStep != null) {
        if (setupStep === "address") return false;
        const previous = prevSetupStep(setupStep, writableCalendars.length);
        if (previous != null) setSetupStep(previous);
        return true;
      }
      if (!isDirty) return false;
      setIsConfirmOpen(true);
      return true;
    };
  }

  useEffect(() => {
    return () => {
      if (dismissGuardRef) dismissGuardRef.current = null;
    };
  }, [dismissGuardRef]);

  const settingsOpenedRef = useRef(false);
  useEffect(() => {
    if (settingsOpenedRef.current) return;
    if (!hasHealthyConnection) {
      settingsOpenedRef.current = true;
      track("booking_settings_opened", {
        has_connection: false,
        is_live: false,
        is_bookable: false,
      });
      return;
    }
    if (isSeedingForm) return;
    const isLive =
      isSavedBookingPage(serverPage) && serverPage.enabled === true;
    if (isLive && !statusQuery.isFetched) return;
    settingsOpenedRef.current = true;
    track("booking_settings_opened", {
      has_connection: true,
      is_live: isLive,
      is_bookable: isLive && statusQuery.data?.bookable === true,
    });
  }, [
    hasHealthyConnection,
    isSeedingForm,
    serverPage,
    statusQuery.data?.bookable,
    statusQuery.isFetched,
  ]);

  const showFirstRunConnectPrompt =
    !hasHealthyConnection &&
    ((serverPage != null && isUnconfiguredBookingPage(serverPage)) ||
      (!isPending && serverPage == null));

  if (showFirstRunConnectPrompt) {
    return <BookingConnectPrompt />;
  }

  if (isSeedingForm) {
    return <p className="text-sm text-text-muted">Loading meeting settings…</p>;
  }

  const savedPage = isSavedBookingPage(serverPage) ? serverPage : null;
  const isLive = savedPage?.enabled === true;
  const savedSlug =
    serverPage && !isUnconfiguredBookingPage(serverPage)
      ? slugFromAdminBookingPage(serverPage)
      : null;
  const addressPrefix = bookingAddressPrefix(savedPage?.bookingUrl ?? null);
  const addressPreview = form.slug ? `${addressPrefix}${form.slug}` : null;
  const { groups: writableGroups, ungrouped: writableUngrouped } =
    groupCalendarsByAccount(writableCalendars, connections);
  const destinationCalendar = writableCalendars.find(
    (calendar) => calendar.id === form.destinationCalendarId,
  );
  const destinationConference = destinationCalendar
    ? resolveBookingConference(
        destinationCalendar.conference,
        destinationCalendar.createsGoogleMeet,
      )
    : "meet";
  const destinationCannotMintMeet = destinationConference === "none";
  const destinationConferenceHint = destinationCalendar
    ? bookingDestinationConferenceHint(destinationCalendar)
    : null;
  const destinationMeetWarningId = "booking-destination-meet-warning";
  const updateForm = (patch: Partial<AdminPutBookingPageInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    setSaveError(null);
  };

  const handleDestinationChange = (destinationCalendarId: CalendarId) => {
    setForm((current) => ({
      ...current,
      destinationCalendarId,
      blockingCalendarIds: defaultBlockingCalendarIdsForDestination(
        destinationCalendarId,
        availabilityCalendars,
      ),
    }));
    setSaveError(null);
  };

  const toggleBlockingCalendar = (calendarId: CalendarId, checked: boolean) => {
    setForm((current) => {
      const next = new Set(current.blockingCalendarIds);
      if (checked) next.add(calendarId);
      else next.delete(calendarId);
      return {
        ...current,
        blockingCalendarIds: [...next],
      };
    });
    setSaveError(null);
  };

  const submit = (
    enabled: boolean,
    options?: { silent?: boolean; fromSetupGoLive?: boolean },
  ) => {
    const error = validateBookingForm({
      enabling: enabled,
      form,
      horizonInvalid,
      minNoticeInvalid,
      writableCalendars,
    });
    if (error) {
      setSaveError(error);
      return;
    }
    setSaveError(null);
    const wasLive = isLive;
    const silent = options?.silent === true;
    if (silent && setupStep == null) focusSwitchAfterSetupRef.current = true;
    saveMutation.mutate(
      { ...form, enabled },
      {
        onError: (mutationError) => {
          if (silent && setupStep == null) {
            focusSwitchAfterSetupRef.current = false;
          }
          const inline = bookingSaveErrorInline(mutationError);
          if (inline) setSaveError(inline);
        },
        onSuccess: (page) => {
          if (!enabled) {
            if (!silent) {
              showStatusToast(
                "booking-link-copied",
                wasLive
                  ? "Meeting page turned off."
                  : "Saved. Turn on your meeting page to share the link.",
              );
            }
            return;
          }
          if (!wasLive) {
            track("booking_page_enabled", {
              first_time:
                savedPage == null || options?.fromSetupGoLive === true,
            });
          }
          if (setupStep != null) {
            setSetupStep(null);
            focusSwitchAfterSetupRef.current = true;
          }
          if (!isSavedBookingPage(page)) return;
          copyBookingLinkThenToast(
            page.bookingUrl,
            wasLive
              ? {
                  onCopy: "Saved. Meeting link copied.",
                  onFail: "Saved. Use Copy to share your link.",
                }
              : {
                  onCopy: "Your meeting page is live. Link copied.",
                  onFail: "Live. Use Copy to share your link.",
                },
          );
        },
      },
    );
  };

  const forceOpenMoreOptions =
    minNoticeInvalid ||
    horizonInvalid ||
    (saveError?.field != null && MORE_OPTIONS_FIELDS.has(saveError.field));

  const handleSetupBack = () => {
    setSetupStep((current) => {
      if (current == null) return current;
      return prevSetupStep(current, writableCalendars.length) ?? current;
    });
    setSaveError(null);
  };

  const advanceSetupStep = () => {
    setSetupStep((current) => {
      if (current == null) return current;
      return nextSetupStep(current, writableCalendars.length) ?? current;
    });
  };

  const handleSetupContinue = () => {
    if (setupStep == null || saveMutation.isPending) return;
    setSaveError(null);

    if (setupStep === "address") {
      const parseMessage = bookingSlugParseMessage(form.slug);
      if (parseMessage) {
        setSaveError({ field: "address", message: parseMessage });
        return;
      }
      void saveMutation
        .mutateAsync({ ...form, enabled: false })
        .then((page) => {
          seededPageRef.current = page;
          advanceSetupStep();
        })
        .catch((mutationError) => {
          const inline = bookingSaveErrorInline(mutationError);
          if (inline) setSaveError(inline);
        });
      return;
    }

    if (setupStep === "hours") {
      if (form.weeklyAvailability.length === 0) {
        setSaveError({
          field: "hours",
          message: "Add weekly hours before turning on your meeting page.",
        });
        return;
      }
      advanceSetupStep();
      return;
    }

    if (setupStep === "duration") {
      advanceSetupStep();
      return;
    }

    if (setupStep === "destination") {
      if (writableCalendars.length === 0) return;
      advanceSetupStep();
      return;
    }

    if (setupStep === "live") {
      submit(true, { fromSetupGoLive: true });
      return;
    }
  };

  if (setupStep != null) {
    const parseMessage = bookingSlugParseMessage(form.slug);
    const addressSetupError =
      setupStep === "address" &&
      saveError?.field === "address" &&
      (parseMessage == null || saveError.message !== parseMessage)
        ? saveError.message
        : null;
    const wizardSetupError =
      setupStep !== "address" ? (saveError?.message ?? null) : null;

    return (
      <BookingSetupWizard
        bookingUrl={savedPage?.bookingUrl ?? null}
        continueRef={setupContinueRef}
        destinationCalendar={destinationCalendar}
        forceAddressInvalid={saveError?.field === "address"}
        form={form}
        isPending={saveMutation.isPending}
        onAddressChange={(nextSlug) => updateForm({ slug: nextSlug })}
        onBack={handleSetupBack}
        onContinue={handleSetupContinue}
        onDestinationChange={handleDestinationChange}
        onDurationChange={(durationMinutes) => updateForm({ durationMinutes })}
        onHoursChange={(weeklyAvailability) =>
          updateForm({ weeklyAvailability })
        }
        setupError={addressSetupError ?? wizardSetupError}
        setupStep={setupStep}
        syncConnections={connections}
        writableCalendarCount={writableCalendars.length}
        writableCalendars={writableCalendars}
      />
    );
  }

  return (
    <>
      <fieldset
        className="flex flex-col gap-2"
        disabled={isReadOnly || saveMutation.isPending}
      >
        {!hasHealthyConnection ? (
          <BookingConnectionBanner
            aggregateState={googleConnectionState}
            connections={connections}
          />
        ) : null}
        <BookingStatusHeader
          addressPreview={addressPreview}
          bookingUrl={savedPage?.bookingUrl ?? null}
          savedUrl={savedMeetingLinkUrl(serverPage)}
          calendars={calendars}
          connections={connections}
          isLive={isLive}
          isPending={saveMutation.isPending}
          onToggle={(next) => submit(next)}
          status={statusQuery.data}
        />

        <div className="max-w-[50%]">
          <BookingFieldLabel htmlFor="booking-duration">
            Duration
          </BookingFieldLabel>
          <select
            {...bookingFieldAttrs("duration")}
            className={BOOKING_SELECT_CLASS_NAME}
            id="booking-duration"
            onChange={(event) =>
              updateForm({
                durationMinutes: Number(
                  event.target.value,
                ) as BookingDurationMinutes,
              })
            }
            value={form.durationMinutes}
          >
            {DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1" {...bookingFieldAttrs("hours")}>
          <BookingWeeklyHoursEditor
            onChange={(weeklyAvailability) =>
              updateForm({ weeklyAvailability })
            }
            value={form.weeklyAvailability}
          />
        </div>

        <BookingMoreOptions forceOpen={forceOpenMoreOptions}>
          <BookingAddressField
            bookingUrl={savedPage?.bookingUrl ?? null}
            forceInvalid={saveError?.field === "address"}
            onChange={(nextSlug) => updateForm({ slug: nextSlug })}
            savedSlug={savedSlug}
            slug={form.slug ?? ""}
          />

          <div>
            <BookingFieldLabel htmlFor="booking-destination-calendar">
              Destination calendar
            </BookingFieldLabel>
            <select
              {...bookingFieldAttrs("destination")}
              aria-describedby={
                destinationCannotMintMeet ? destinationMeetWarningId : undefined
              }
              className={BOOKING_SELECT_CLASS_NAME}
              id="booking-destination-calendar"
              onChange={(event) =>
                handleDestinationChange(event.target.value as CalendarId)
              }
              value={form.destinationCalendarId}
            >
              {writableCalendars.length === 0 ? (
                <option value={BOOKING_PLACEHOLDER_CALENDAR_ID}>
                  No writable calendars
                </option>
              ) : (
                <>
                  {writableGroups
                    .filter((group) => group.calendars.length > 0)
                    .map((group) => (
                      <optgroup
                        key={group.accountEmail}
                        label={group.accountEmail}
                      >
                        {group.calendars.map((calendar) => (
                          <option key={calendar.id} value={calendar.id}>
                            {formatBookingDestinationOptionLabel(calendar)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  {writableUngrouped.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {formatBookingDestinationOptionLabel(calendar)}
                    </option>
                  ))}
                </>
              )}
            </select>
            {destinationConferenceHint ? (
              <p
                className="mt-1 text-sm text-warning"
                id={destinationMeetWarningId}
                role="status"
              >
                {destinationConferenceHint}
              </p>
            ) : null}
          </div>

          <div className="min-w-0" {...bookingFieldAttrs("timezone")}>
            <BookingTimezoneField
              onChange={(timeZone) => updateForm({ timeZone })}
              timeZone={form.timeZone}
            />
          </div>

          <BookingBlockingCalendarsField
            availabilityCalendars={availabilityCalendars}
            blockingCalendarIds={form.blockingCalendarIds}
            connections={connections}
            onToggle={toggleBlockingCalendar}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <BookingNumberField
                field="notice"
                id="booking-min-notice"
                invalid={minNoticeInvalid}
                invalidMessage={`Enter 0 to ${BOOKING_MAX_MIN_NOTICE_HOURS} hours.`}
                label="Minimum notice (hours)"
                max={BOOKING_MAX_MIN_NOTICE_HOURS}
                min={0}
                onChange={(raw) => {
                  setMinNoticeText(raw);
                  const parsed = parseBookingCount(raw, MIN_NOTICE_BOUNDS);
                  if (parsed !== null) {
                    updateForm({ minNoticeHours: parsed });
                  }
                }}
                value={minNoticeText}
              />
            </div>
            <div className="min-w-0">
              <BookingNumberField
                field="horizon"
                id="booking-max-horizon"
                invalid={horizonInvalid}
                invalidMessage={`Enter 1 to ${BOOKING_MAX_HORIZON_DAYS} days.`}
                label="Maximum horizon (days)"
                max={BOOKING_MAX_HORIZON_DAYS}
                min={1}
                onChange={(raw) => {
                  setHorizonText(raw);
                  const parsed = parseBookingCount(raw, HORIZON_BOUNDS);
                  if (parsed !== null) {
                    updateForm({ maxHorizonDays: parsed });
                  }
                }}
                value={horizonText}
              />
            </div>
          </div>
        </BookingMoreOptions>

        <BookingSaveBar
          error={saveError?.message ?? null}
          isPending={saveMutation.isPending}
          onSubmit={() => submit(savedPage?.enabled ?? false)}
        />
      </fieldset>
      <DiscardUnsavedChangesDialog
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onDiscard={() => {
          setIsConfirmOpen(false);
          onDiscardUnsaved?.();
        }}
      />
    </>
  );
}
