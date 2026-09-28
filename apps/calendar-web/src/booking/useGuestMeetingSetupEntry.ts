import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import {
  isMeetingSetupRequested,
  MEETING_SETUP_SEARCH_PARAM,
} from "@web/booking/meeting-setup.search";
import { isMobileOS } from "@web/common/utils/device/device.util";
import { type AuthSearch } from "@web/components/AuthModal/hooks/useAuthModal";
import { settingsActions } from "@web/settings/settings.store";

interface GuestMeetingSetupEntryOptions {
  /** Test seam; defaults to the device check. */
  isMobile?: boolean;
}

/**
 * Opens Meeting settings when a guest follows the public-page footer CTA
 * (`/?meetingSetup=1`). Anonymous users preview the setup wizard locally;
 * saves are gated behind sign-up inside BookingSettingsSection.
 *
 * On a phone the wizard is a dead end: sign-up lands on MobileGate and the
 * local draft never reaches a computer. Leave the flag in the URL there so
 * RootView shows the desktop handoff and the copied link still opens the
 * wizard on a computer.
 */
export function useGuestMeetingSetupEntry({
  isMobile = isMobileOS(),
}: GuestMeetingSetupEntryOptions = {}) {
  const search = useSearch({ strict: false }) as AuthSearch;
  const navigate = useNavigate();
  const { authenticated } = useSession();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (isMobile) return;
    if (consumedRef.current || !isMeetingSetupRequested(search)) return;
    consumedRef.current = true;
    if (authenticated) {
      settingsActions.openSettings("booking");
    } else {
      settingsActions.beginGuestMeetingSetup();
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
  }, [authenticated, isMobile, navigate, search]);
}
