import "@testing-library/jest-dom";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import {
  type AdminPutBookingPageInput,
  DEFAULT_WEEKLY_AVAILABILITY,
} from "@core/types/booking.contracts";
import {
  CalendarIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import {
  resetProviderAvailabilityForTests,
  setProviderAvailabilityForTests,
} from "@web/auth/providers/useIsProviderAvailable";
import { BOOKING_SAVE_ERROR_COPY } from "@web/booking/booking.query";
import { BookingSetupWizard } from "@web/booking/setup/BookingSetupWizard";
import {
  nextSetupStep,
  prevSetupStep,
  SETUP_DESTINATION_ZERO_CALENDARS_SENTENCE,
  type SetupStepId,
} from "@web/booking/setup/setup-steps";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { afterEach, describe, expect, it } from "bun:test";

const destinationCalendarId = CalendarIdSchema.parse(createObjectIdString());

const defaultForm: AdminPutBookingPageInput = {
  slug: "hostuser",
  enabled: false,
  durationMinutes: 30,
  destinationCalendarId,
  blockingCalendarIds: [destinationCalendarId],
  timeZone: TimeZoneSchema.parse("UTC"),
  weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
  minNoticeHours: 4,
  maxHorizonDays: 60,
};

function WizardHarness({
  initialStep = "address",
  writableCalendarCount = 1,
  forceAddressInvalid = false,
  setupError = null,
}: {
  initialStep?: SetupStepId;
  writableCalendarCount?: number;
  forceAddressInvalid?: boolean;
  setupError?: string | null;
}) {
  const [step, setStep] = useState(initialStep);
  const continueRef = useRef<HTMLButtonElement>(null);

  return (
    <HotkeysProvider>
      <BookingSetupWizard
        bookingUrl={null}
        continueRef={continueRef}
        destinationCalendar={undefined}
        forceAddressInvalid={forceAddressInvalid}
        form={defaultForm}
        isPending={false}
        onAddressChange={() => {}}
        onBack={() => {
          setStep(
            (current) =>
              prevSetupStep(current, writableCalendarCount) ?? current,
          );
        }}
        onContinue={() => {
          setStep(
            (current) =>
              nextSetupStep(current, writableCalendarCount) ?? current,
          );
        }}
        onDestinationChange={() => {}}
        onDurationChange={() => {}}
        onHoursChange={() => {}}
        setupError={setupError}
        setupStep={step}
        syncConnections={[]}
        writableCalendarCount={writableCalendarCount}
        writableCalendars={[]}
      />
    </HotkeysProvider>
  );
}

const renderWizard = (props: Parameters<typeof WizardHarness>[0] = {}) => {
  const { wrapper } = createStoreWrapper();
  return render(<WizardHarness {...props} />, { wrapper });
};

afterEach(() => {
  resetProviderAvailabilityForTests();
});

describe("BookingSetupWizard", () => {
  it("shows the zero-calendar destination prompt with Continue disabled", async () => {
    setProviderAvailabilityForTests("google", "available", "connect");

    renderWizard({ initialStep: "destination", writableCalendarCount: 0 });

    expect(
      screen.getByText(SETUP_DESTINATION_ZERO_CALENDARS_SENTENCE),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeDisabled();
  });

  it("shows Back from step 2 and hides it on step 1", async () => {
    const user = userEvent.setup({ delay: null });

    renderWizard({ initialStep: "hours" });

    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Pick your address" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  it("labels keyboard hint chips", () => {
    renderWizard({ initialStep: "hours" });

    const hintRow = screen.getByText("Next").closest(".inline-flex");
    expect(hintRow?.textContent).toMatch(/Continue/);
    expect(hintRow?.textContent).toMatch(/Back/);
    expect(hintRow?.textContent).toMatch(/Next/);
  });

  it("focuses the address field after a SLUG_TAKEN error", async () => {
    renderWizard({
      forceAddressInvalid: true,
      setupError: BOOKING_SAVE_ERROR_COPY.SLUG_TAKEN,
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByLabelText("Page address"),
      );
    });
  });
});
