import "@testing-library/jest-dom";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, createRef } from "react";
import { buildDefaultAdminPutInput } from "@core/types/booking.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realAvailableProviders from "@web/auth/providers/useAvailableConnectProviders";
import * as realConnectProvider from "@web/auth/providers/useConnectProvider";
import { BOOKING_SAVE_ERROR_COPY } from "@web/booking/booking.query";
import { BookingSetupWizard } from "@web/booking/setup/BookingSetupWizard";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let available: ProviderKind[] = ["google"];
const mockConnectGoogle = mock();

mockModuleForFile(
  "@web/auth/providers/useAvailableConnectProviders",
  realAvailableProviders,
  { useAvailableConnectProviders: () => available },
);

mockModuleForFile(
  "@web/auth/providers/useConnectProvider",
  realConnectProvider,
  {
    useConnectProvider: (_kind: ProviderKind) => ({
      state: "NOT_CONNECTED",
      isAvailable: true,
      isConnecting: false,
      isRefreshing: false,
      commandAction: {
        label: "Connect Google Calendar",
        onSelect: mockConnectGoogle,
      },
      connect: mockConnectGoogle,
    }),
  },
);

const defaultForm = {
  ...buildDefaultAdminPutInput(TimeZoneSchema.parse("UTC")),
  slug: "hostuser",
};

const renderWizard = (
  props: Partial<ComponentProps<typeof BookingSetupWizard>> = {},
) => {
  const continueRef = createRef<HTMLButtonElement>();
  const onBack = mock(() => {});
  const onContinue = mock(() => {});
  render(
    <HotkeysProvider>
      <BookingSetupWizard
        bookingUrl={null}
        continueRef={continueRef}
        destinationCalendar={undefined}
        form={defaultForm}
        isPending={false}
        onAddressChange={mock(() => {})}
        onBack={onBack}
        onContinue={onContinue}
        onDestinationChange={mock(() => {})}
        onDurationChange={mock(() => {})}
        onHoursChange={mock(() => {})}
        setupError={null}
        setupStep="address"
        syncConnections={[]}
        writableCalendarCount={0}
        writableCalendars={[]}
        {...props}
      />
    </HotkeysProvider>,
  );
  return { continueRef, onBack, onContinue };
};

beforeEach(() => {
  available = ["google"];
});

afterEach(() => {
  mockConnectGoogle.mockClear();
});

describe("BookingSetupWizard", () => {
  it("shows the zero-calendar destination step with connect and disabled Continue", async () => {
    renderWizard({ setupStep: "destination" });

    expect(
      screen.getByText(
        "Connect a calendar you can write to before going live.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeDisabled();
  });

  it("shows Back on step 2", async () => {
    const user = userEvent.setup({ delay: null });
    const { onBack } = renderWizard({
      setupStep: "hours",
      writableCalendarCount: 1,
    });

    const backButton = screen.getByRole("button", { name: "Back" });
    expect(backButton).toBeInTheDocument();
    await user.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("hides Back on step 1", () => {
    renderWizard({ setupStep: "address", writableCalendarCount: 1 });
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  it("labels keyboard hint chips", () => {
    renderWizard({ setupStep: "hours", writableCalendarCount: 1 });

    const hintRow = screen.getByText("Next").closest(".text-text-muted");
    expect(hintRow).not.toBeNull();
    const hints = within(hintRow as HTMLElement);
    expect(hints.getByText("Continue")).toBeInTheDocument();
    expect(hints.getByText("Next")).toBeInTheDocument();
    expect(hints.getAllByText("Back")).toHaveLength(2);
  });

  it("focuses the address field after a SLUG_TAKEN error", async () => {
    renderWizard({
      forceAddressInvalid: true,
      setupError: BOOKING_SAVE_ERROR_COPY.SLUG_TAKEN,
      setupStep: "address",
      writableCalendarCount: 1,
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByLabelText("Page address"),
      );
    });
  });
});
