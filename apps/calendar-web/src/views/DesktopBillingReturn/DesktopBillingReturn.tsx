import { useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  openDesktopBillingReturn,
  relayDesktopBillingReturn,
} from "@web/billing/desktop-billing-return";

/**
 * Shown in the default browser when Stripe hosted Checkout returns for Compass
 * Desktop. The deep link opens the app; the copy is a fallback if it does not.
 */
export function DesktopBillingReturn() {
  const { outcome, session_id: sessionId } = useSearch({ strict: false });
  const outcomeValue = typeof outcome === "string" ? outcome : "";
  const sessionIdValue = typeof sessionId === "string" ? sessionId : "";
  const relayUrl = relayDesktopBillingReturn(outcomeValue, sessionIdValue);

  useEffect(() => {
    openDesktopBillingReturn(relayUrl);
  }, [relayUrl]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <p className="text-center text-muted-foreground text-sm">
        Returning to Compass to finish billing.
      </p>
    </main>
  );
}
