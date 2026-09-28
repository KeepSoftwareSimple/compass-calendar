import { useEffect, useRef } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import { readGuestMeetingSetupDraft } from "@web/booking/guest-meeting-setup.util";
import { settingsActions } from "@web/settings/settings.store";

/**
 * After sign-up (email or OAuth reload), reopens Meeting settings when a guest
 * wizard draft is still in local storage so the host can go live.
 */
export function useGuestMeetingSetupResume() {
  const { authenticated } = useSession();
  const openedForDraftRef = useRef(false);

  useEffect(() => {
    if (!authenticated) {
      openedForDraftRef.current = false;
      return;
    }
    if (openedForDraftRef.current) return;
    if (readGuestMeetingSetupDraft() == null) return;
    openedForDraftRef.current = true;
    settingsActions.openSettings("booking");
  }, [authenticated]);
}
