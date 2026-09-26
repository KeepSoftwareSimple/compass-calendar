import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import {
  MEETING_SETUP_SEARCH_PARAM,
  readGuestMeetingSetupDraft,
} from "@web/booking/guest-meeting-setup.util";
import { type AuthSearch } from "@web/components/AuthModal/hooks/useAuthModal";
import { settingsActions } from "@web/settings/settings.store";

function hasMeetingSetupIntent(search: AuthSearch): boolean {
  const value = search.meetingSetup;
  return value === true || value === 1 || value === "1" || value === "true";
}

/**
 * Opens Meeting settings when a guest follows the public-page footer CTA
 * (`/?meetingSetup=1`). Anonymous users preview the setup wizard locally;
 * saves are gated behind sign-up inside BookingSettingsSection.
 */
export function useGuestMeetingSetupEntry() {
  const search = useSearch({ strict: false }) as AuthSearch;
  const navigate = useNavigate();
  const { authenticated } = useSession();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current || !hasMeetingSetupIntent(search)) return;
    consumedRef.current = true;
    if (authenticated) {
      settingsActions.openSettings("booking");
    } else {
      settingsActions.beginGuestMeetingSetup(
        Boolean(readGuestMeetingSetupDraft()),
      );
    }
    void navigate({
      to: ".",
      replace: true,
      search: (prev: AuthSearch) => {
        const next = { ...prev };
        delete next[MEETING_SETUP_SEARCH_PARAM];
        return next;
      },
    });
  }, [authenticated, navigate, search]);
}
