import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { type FC, useEffect, useState } from "react";
import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import {
  FOOTER_ICON_BUTTON_CLASS,
  SIDEBAR_REFRESH_SLOT_CLASS,
} from "@web/components/Sidebar/SidebarActions/sidebar-footer.constants";
import { useAppUpdateAvailableNotice } from "@web/components/Sidebar/SidebarActions/useAppUpdateAvailableNotice";
import { useReloadAppShortcut } from "@web/components/Sidebar/SidebarActions/useReloadAppShortcut";
import { useVersionCheck } from "@web/components/Sidebar/SidebarActions/useVersionCheck";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import { useSseDegradedSince } from "@web/sse/hooks/useSseDegraded";

// The SSE client stops reconnecting after a bounded episode; past this age
// a reload is the recovery that always works.
export const REFRESH_AFTER_DEGRADED_MS = 30_000;

/** Tooltip for the sidebar reload control (SSE recovery and app updates). */
export const SIDEBAR_RELOAD_DESCRIPTION = "Reload for the latest version";

const useRefreshDue = (degradedSinceMs: number | null): boolean => {
  const [due, setDue] = useState(false);

  useEffect(() => {
    if (degradedSinceMs === null) {
      setDue(false);
      return;
    }
    const remainingMs =
      degradedSinceMs + REFRESH_AFTER_DEGRADED_MS - Date.now();
    if (remainingMs <= 0) {
      setDue(true);
      return;
    }
    setDue(false);
    const timer = setTimeout(() => setDue(true), remainingMs);
    return () => clearTimeout(timer);
  }, [degradedSinceMs]);

  return due;
};

/**
 * Sidebar-footer reload control for a stale live-update stream or a newer
 * app version. Both cases reload the page. Tooltip and toast name Mod+R
 * because pointer clicks are suppressed in the keyboard-only calendar.
 */
export const SidebarRefreshButton: FC = () => {
  const degradedSinceMs = useSseDegradedSince();
  const refreshDue = useRefreshDue(degradedSinceMs);
  const { isUpdateAvailable, availableVersion } = useVersionCheck();

  useAppUpdateAvailableNotice(isUpdateAvailable, availableVersion);

  const visible = refreshDue || isUpdateAvailable;
  const description = SIDEBAR_RELOAD_DESCRIPTION;

  useReloadAppShortcut(visible);

  return (
    <div aria-live="polite" className={SIDEBAR_REFRESH_SLOT_CLASS}>
      {visible ? (
        <TooltipWrapper
          description={description}
          onClick={reloadLocation}
          shortcut={["Mod", "R"]}
        >
          <button
            aria-label={description}
            className={FOOTER_ICON_BUTTON_CLASS}
            type="button"
          >
            <ArrowClockwiseIcon aria-hidden="true" size={16} />
          </button>
        </TooltipWrapper>
      ) : null}
    </div>
  );
};
