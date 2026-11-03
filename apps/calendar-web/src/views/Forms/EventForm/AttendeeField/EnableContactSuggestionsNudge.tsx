import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useEffect, useState } from "react";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { connectionProvider } from "@web/auth/providers/provider-copy.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import {
  dismissContactsNudge,
  markContactsNudgeShown,
  shouldShowContactsNudge,
} from "./contact-nudge.gate";

interface EnableContactSuggestionsNudgeProps {
  /** The account to add contacts for; consent is pinned to it. */
  connection: SyncConnectionSummary;
}

/**
 * Footer row in the guest listbox, shown when a search finds nobody and an
 * account could still add contacts. It names that account and pins consent
 * to it, so the user cannot grant contacts on the wrong one. Never a modal;
 * the gate shows it at most once per session and never after a dismiss. On
 * return the refreshed metadata turns suggestions on without a reload.
 */
export const EnableContactSuggestionsNudge = ({
  connection,
}: EnableContactSuggestionsNudgeProps) => {
  // Decided once per mount: the nudge either owns this showing or stays
  // away entirely; it never pops in mid-typing.
  const [isVisible, setIsVisible] = useState(() => shouldShowContactsNudge());
  const { connect, isConnecting } = useConnectProvider(
    connectionProvider(connection),
    { connection, features: ["contacts"] },
  );

  useEffect(() => {
    if (isVisible) markContactsNudgeShown();
  }, [isVisible]);

  if (!isVisible) return null;

  const label = connection.accountEmail
    ? `Turn on contacts for ${connection.accountEmail}`
    : "Turn on contacts";

  return (
    <div className="flex items-center justify-between gap-2 border-border border-t px-3 py-2 text-xs">
      <p className="min-w-0 truncate text-text-muted">
        Missing someone?{" "}
        <button
          type="button"
          className="text-accent hover:text-accent-hover"
          disabled={isConnecting}
          onClick={connect}
        >
          {label}
        </button>
      </p>
      <button
        type="button"
        aria-label="Dismiss contact suggestions tip"
        className="shrink-0 text-text-subtle hover:text-text"
        onClick={() => {
          dismissContactsNudge();
          setIsVisible(false);
        }}
      >
        <XIcon size={12} />
      </button>
    </div>
  );
};
