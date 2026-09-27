import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import { bookingConnectPromptCopy } from "@web/auth/providers/provider-copy.util";
import { useAvailableConnectProviders } from "@web/auth/providers/useAvailableConnectProviders";

export const BOOKING_CONNECT_EMPTY_ENV_COPY =
  "Calendar sign-in is not configured in this environment.";

export function BookingConnectPrompt() {
  const connectable = useAvailableConnectProviders();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">
        {bookingConnectPromptCopy(connectable)}
      </p>
      {connectable.length > 0 ? (
        <ConnectProviderChooser variant="prompt" />
      ) : (
        <p className="text-sm text-text-muted">
          {BOOKING_CONNECT_EMPTY_ENV_COPY}
        </p>
      )}
    </div>
  );
}
