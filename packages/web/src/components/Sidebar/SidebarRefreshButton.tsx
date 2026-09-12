import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { type FC, useEffect, useState } from "react";
import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { useVersionCheck } from "@web/components/Sidebar/SidebarActions/useVersionCheck";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import { useSseDegradedSince } from "@web/sse/hooks/useSseDegraded";

// Native EventSource retries on its own for transient drops but gives up for
// good once the browser marks it CLOSED. Past this age a reload is the
// recovery that always works.
export const REFRESH_AFTER_DEGRADED_MS = 30_000;

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
 * Sidebar-footer Refresh control for a stale live-update stream or a newer
 * app version. Both cases reload the page. Tooltip and blocked-click hint
 * name Mod+R because pointer clicks are suppressed in the keyboard-only
 * calendar.
 */
export const SidebarRefreshButton: FC = () => {
  const degradedSinceMs = useSseDegradedSince();
  const refreshDue = useRefreshDue(degradedSinceMs);
  const { isUpdateAvailable } = useVersionCheck();

  if (!refreshDue && !isUpdateAvailable) return null;

  const description = refreshDue
    ? "Reload for the latest calendar"
    : "Get latest version";

  return (
    <div aria-live="polite" className="flex shrink-0 items-center">
      <TooltipWrapper
        description={description}
        onClick={reloadLocation}
        shortcut={["Mod", "R"]}
      >
        <button
          className="c-focus-ring inline-flex h-9 items-center gap-1 rounded-default px-2 text-xs text-text-muted transition hover:bg-surface-panel hover:text-text"
          type="button"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={14} />
          Refresh
        </button>
      </TooltipWrapper>
    </div>
  );
};
