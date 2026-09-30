import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import { isMobileOS } from "@web/common/utils/device/device.util";
import {
  type AuthSearch,
  VIEW_TO_PARAM,
} from "@web/components/AuthModal/hooks/useAuthModal";
import { SETTINGS_SEARCH_PARAM } from "@web/settings/settings.search";
import { settingsActions } from "@web/settings/settings.store";

interface SettingsSearchEntryOptions {
  /** Test seam; defaults to the device check. */
  isMobile?: boolean;
}

/**
 * Opens Settings on the page named by `/?settings=<page>` (welcome email
 * CTAs). Signed-in users land on the page and the param is consumed. An
 * anonymous visitor is asked to log in first; the param stays in the URL so
 * Settings opens as soon as the session lands. Phones see MobileGate, where
 * Settings is not mounted, so the param is left alone there.
 *
 * Opening Settings pushes a history entry (useSettingsBrowserBack) before
 * the param is stripped, so the back button returns to the URL that still
 * carries it. The consumed guard keeps that entry from reopening Settings.
 */
export function useSettingsSearchEntry({
  isMobile = isMobileOS(),
}: SettingsSearchEntryOptions = {}) {
  const search = useSearch({ strict: false }) as AuthSearch;
  const navigate = useNavigate();
  const { authenticated } = useSession();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (isMobile || consumedRef.current) return;
    const page = search[SETTINGS_SEARCH_PARAM];
    if (!page) return;
    if (!authenticated) {
      if (search.auth) return;
      void navigate({
        to: ".",
        replace: true,
        search: (prev: AuthSearch) => ({ ...prev, auth: VIEW_TO_PARAM.login }),
      });
      return;
    }
    consumedRef.current = true;
    settingsActions.openSettings(page);
    void navigate({
      to: ".",
      replace: true,
      search: (prev: AuthSearch) => {
        const next = { ...prev };
        delete next[SETTINGS_SEARCH_PARAM];
        return next;
      },
    });
  }, [authenticated, isMobile, navigate, search]);
}
