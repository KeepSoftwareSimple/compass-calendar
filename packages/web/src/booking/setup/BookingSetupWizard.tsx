import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";
import {
  type AdminPutBookingPageInput,
  type BookingDurationMinutes,
} from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { BookingSetupAddressStep } from "@web/booking/setup/BookingSetupAddressStep";
import { BookingSetupDestinationStep } from "@web/booking/setup/BookingSetupDestinationStep";
import { BookingSetupDurationStep } from "@web/booking/setup/BookingSetupDurationStep";
import { BookingSetupGoLiveStep } from "@web/booking/setup/BookingSetupGoLiveStep";
import { BookingSetupHoursStep } from "@web/booking/setup/BookingSetupHoursStep";
import {
  type SetupStepId,
  setupStepDefinition,
  setupStepProgress,
} from "@web/booking/setup/setup-steps";
import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";
import {
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { settingsShortcutAttrs } from "@web/settings/useSettingsShortcuts";

interface BookingSetupWizardProps {
  bookingUrl: string | null;
  continueRef: RefObject<HTMLButtonElement | null>;
  destinationCalendar: Calendar | undefined;
  form: AdminPutBookingPageInput;
  isPending: boolean;
  onAddressChange: (slug: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onDestinationChange: (destinationCalendarId: CalendarId) => void;
  onDurationChange: (durationMinutes: BookingDurationMinutes) => void;
  onHoursChange: (
    weeklyAvailability: AdminPutBookingPageInput["weeklyAvailability"],
  ) => void;
  setupError: string | null;
  setupStep: SetupStepId;
  syncConnections: SyncConnectionSummary[];
  forceAddressInvalid?: boolean;
  writableCalendarCount: number;
  writableCalendars: Calendar[];
}

const focusStepFirstControl = (
  stepId: SetupStepId,
  root: HTMLElement | null,
) => {
  if (root == null) return;
  switch (stepId) {
    case "address":
      root.querySelector<HTMLElement>("#booking-address")?.focus();
      break;
    case "hours":
      root.querySelector<HTMLElement>("input, select, button")?.focus();
      break;
    case "duration":
      root.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
      break;
    case "destination":
      root
        .querySelector<HTMLElement>("#booking-setup-destination-calendar")
        ?.focus();
      break;
    case "live":
      continueRefFallback(root)?.focus();
      break;
    default:
      break;
  }
};

const continueRefFallback = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>(
    '[data-settings-shortcut="save-booking"]',
  );

export function BookingSetupWizard({
  bookingUrl,
  continueRef,
  destinationCalendar,
  form,
  isPending,
  onAddressChange,
  onBack,
  onContinue,
  onDestinationChange,
  onDurationChange,
  onHoursChange,
  setupError,
  setupStep,
  syncConnections,
  forceAddressInvalid = false,
  writableCalendarCount,
  writableCalendars,
}: BookingSetupWizardProps) {
  const stepBodyRef = useRef<HTMLDivElement>(null);
  const stepMeta = setupStepDefinition(setupStep);
  const { current, total } = setupStepProgress(
    setupStep,
    writableCalendarCount,
  );
  const isGoLive = setupStep === "live";

  useEffect(() => {
    if (setupStep === "live") {
      continueRef.current?.focus();
      return;
    }
    focusStepFirstControl(setupStep, stepBodyRef.current);
  }, [continueRef, setupStep]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (
      (event.key === "k" || event.key === "K") &&
      !isEditableKeyboardTarget(event)
    ) {
      event.preventDefault();
      onContinue();
      return;
    }

    if (
      (event.key === "j" || event.key === "J") &&
      !isEditableKeyboardTarget(event)
    ) {
      event.preventDefault();
      onBack();
      return;
    }

    if (event.key !== "Enter" || event.shiftKey || event.altKey) return;

    const isTextInput =
      target instanceof HTMLInputElement &&
      (target.type === "text" ||
        target.type === "search" ||
        target.type === "");
    const isContinueButton = target === continueRef.current;
    if (!isTextInput && !isContinueButton) return;

    event.preventDefault();
    onContinue();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keydown here is a wizard-scoped shortcut layer, not an interactive element in its own right
    <div className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
      <p aria-live="polite" className="sr-only">
        {stepMeta.title}. Step {current} of {total}.
      </p>
      <p className="text-sm text-text-muted">
        Step {current} of {total}
      </p>
      <div className="flex flex-col gap-2">
        <h2 className="font-medium text-lg text-text">{stepMeta.title}</h2>
        <p className="text-sm text-text">{stepMeta.sentence}</p>
      </div>

      <div ref={stepBodyRef}>
        {setupStep === "address" ? (
          <BookingSetupAddressStep
            bookingUrl={bookingUrl}
            error={setupError}
            forceInvalid={forceAddressInvalid}
            onChange={onAddressChange}
            slug={form.slug ?? ""}
          />
        ) : null}
        {setupStep === "hours" ? (
          <BookingSetupHoursStep
            onChange={onHoursChange}
            timeZone={form.timeZone}
            value={form.weeklyAvailability}
          />
        ) : null}
        {setupStep === "duration" ? (
          <BookingSetupDurationStep
            onChange={onDurationChange}
            value={form.durationMinutes}
          />
        ) : null}
        {setupStep === "destination" ? (
          <BookingSetupDestinationStep
            connections={syncConnections}
            destinationCalendarId={form.destinationCalendarId}
            onChange={onDestinationChange}
            writableCalendars={writableCalendars}
          />
        ) : null}
        {setupStep === "live" ? (
          <BookingSetupGoLiveStep
            bookingUrl={bookingUrl}
            destinationCalendar={destinationCalendar}
            durationMinutes={form.durationMinutes}
            slug={form.slug ?? ""}
            timeZone={form.timeZone}
            weeklyAvailability={form.weeklyAvailability}
          />
        ) : null}
      </div>

      {setupError && setupStep !== "address" ? (
        <p className="font-medium text-sm text-text" role="alert">
          {setupError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="inline-flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <ShortcutKeys keys="Enter" />
          <span>Continue</span>
          <ShortcutKeys keys="Esc" />
          <span>Back</span>
          <ShortcutKeys keys={["J", "K"]} />
        </span>
        <OverlayPanelActions>
          <OverlayPanelActionButton
            aria-busy={isPending || undefined}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            disabled={isPending}
            onClick={onContinue}
            ref={continueRef}
            shortcut={["Mod", "Enter"]}
            showShortcut
            variant="primary"
            {...settingsShortcutAttrs("save-booking")}
          >
            {isGoLive ? "Turn on and copy link" : "Continue"}
          </OverlayPanelActionButton>
        </OverlayPanelActions>
      </div>
    </div>
  );
}

export { focusStepFirstControl };
