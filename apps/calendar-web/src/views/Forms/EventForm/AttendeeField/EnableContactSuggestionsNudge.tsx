import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useEffect, useState } from "react";
import { useConnectGoogle } from "@web/auth/providers/useConnectProvider";
import {
  dismissContactsNudge,
  markContactsNudgeShown,
  shouldShowContactsNudge,
} from "./contact-nudge.gate";

/**
 * The "occasional, non-nagging" enable-contacts affordance (product decision
 * 1): an inline footer row in the attendee combobox — never a modal — shown
 * at most once per session and never again after an explicit dismiss (the
 * gate persists dismissal to localStorage). Clicking it starts the connect
 * flow's incremental re-consent with the optional contacts scopes; on return
 * the refreshed metadata flips the capability on and suggestions go live
 * without a manual reload.
 */
export const EnableContactSuggestionsNudge = () => {
  // Decided once per mount (one menu-open episode): the nudge either owns
  // this opening or stays away entirely — it never pops in mid-typing.
  const [isVisible, setIsVisible] = useState(() => shouldShowContactsNudge());
  const { connect, isConnecting } = useConnectGoogle({
    features: ["contacts"],
  });

  useEffect(() => {
    if (isVisible) markContactsNudgeShown();
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-border border-t px-3 py-2">
      <button
        type="button"
        className="text-left text-accent text-xs hover:text-accent-hover"
        disabled={isConnecting}
        onClick={connect}
      >
        Enable contact suggestions
      </button>
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
