import { useEffect, useRef } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import { readGuestMeetingSetupDraft } from "@web/booking/guest-meeting-setup.util";
import {
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";

/**
 * After sign-up, reopen Meeting settings at go-live when a guest wizard draft
 * is still in local storage (email path without reload, or OAuth full reload).
 */
export function useGuestMeetingSetupResume() {
  const { authenticated } = useSession();
  const resumedRef = useRef(false);

  useEffect(() => {
    if (!authenticated) {
      resumedRef.current = false;
      return;
    }
    if (resumedRef.current || readGuestMeetingSetupDraft() == null) return;
    resumedRef.current = true;
    const { isSettingsOpen, settingsPage } = useSettingsStore.getState();
    if (!isSettingsOpen || settingsPage !== "booking") {
      settingsActions.beginGuestMeetingSetup();
    } else {
      useSettingsStore.setState({ guestMeetingSetupActive: true }, false, {
        type: "resumeGuestMeetingSetup",
      });
    }
  }, [authenticated]);
}
