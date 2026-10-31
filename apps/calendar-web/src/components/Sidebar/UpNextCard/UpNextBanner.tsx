import { type FC, useState } from "react";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { formatUpNextNudgeMultiSummary } from "@core/up-next/up-next-nudge-window.util";
import dayjs from "@core/util/date/dayjs";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { Z_INDEX_FLOATING_MENU } from "@web/common/constants/web.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { formatEventStatus } from "@web/components/Sidebar/UpNextCard/UpNextCard";
import { UpNextEventPicker } from "@web/components/Sidebar/UpNextCard/UpNextEventPicker";
import {
  upNextNudgeUiActions,
  useUpNextNudgeUiStore,
} from "@web/components/Sidebar/UpNextCard/up-next-nudge-ui.store";
import { useUpNextEvent } from "@web/components/Sidebar/UpNextCard/useUpNextEvent";
import { useUpNextOsNotification } from "@web/components/Sidebar/UpNextCard/useUpNextOsNotification";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import { useAppShortcutUp } from "@web/shortcuts/useAppShortcut";

/**
 * A centered banner that surfaces timed events in the Up Next nudge window.
 * N opens the event, or a picker when several qualify. V joins when a
 * conference URL exists on the primary Up Next event.
 */
export const UpNextBanner: FC = () => {
  const {
    now,
    openEventDetails,
    openEventById,
    upNext,
    nudgeWindow,
    pickerRows,
    conferenceUrl,
    nudgePrimaryGridEvent,
    nudgeConferenceUrl,
  } = useUpNextEvent();
  const { isPickerOpen, openActivity } = useUpNextNudgeUiStore();
  const [dismissedId, setDismissedId] = useState<string | undefined>(undefined);
  const { closing, beginDismiss } = useDismissTransition(BANNER_DISMISS_MS);

  const isWithinWindow = nudgeWindow.occurrences.length > 0;
  const isVisible =
    isWithinWindow && nudgeWindow.primary?.id !== dismissedId && !isPickerOpen;

  useUpNextOsNotification(
    upNext?._id
      ? {
          _id: upNext._id,
          title: upNext.title,
          startDate: upNext.startDate,
        }
      : undefined,
    isVisible,
  );

  const openConference = () => {
    const url = nudgeConferenceUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const dismiss = () => {
    beginDismiss(() => setDismissedId(nudgeWindow.primary?.id));
  };

  const upNextShortcuts = APP_SHORTCUT_BINDINGS;
  useAppShortcutUp(
    upNextShortcuts.navUpNext.hotkey,
    () => openEventDetails("keyboardEdit"),
    { shortcutId: "nav-up-next" },
  );
  useAppShortcutUp(
    upNextShortcuts.navJoinMeeting.hotkey,
    () => {
      if (conferenceUrl) {
        window.open(conferenceUrl, "_blank", "noopener,noreferrer");
      }
    },
    {
      enabled: Boolean(conferenceUrl),
      shortcutId: "nav-join-meeting",
    },
  );
  useAppShortcutUp(
    "Escape",
    () => {
      if (isPickerOpen) {
        upNextNudgeUiActions.closePicker();
        return;
      }
      dismiss();
    },
    { enabled: isVisible || isPickerOpen },
  );

  if (isPickerOpen && pickerRows.length > 1) {
    return (
      <UpNextEventPicker
        hasCurrentEvent={nudgeWindow.hasCurrentEvent}
        onClose={() => upNextNudgeUiActions.closePicker()}
        onSelect={(eventId) =>
          openEventById(eventId, openActivity ?? "keyboardEdit")
        }
        rows={pickerRows}
      />
    );
  }

  if (!isVisible || !nudgeWindow.primary) {
    return null;
  }

  const countdown =
    nudgeWindow.occurrences.length > 1
      ? formatUpNextNudgeMultiSummary(
          nudgeWindow.occurrences.length,
          nudgeWindow.hasCurrentEvent,
        )
      : nudgePrimaryGridEvent
        ? formatEventStatus(
            dayjs(nudgePrimaryGridEvent.startDate),
            dayjs(nudgePrimaryGridEvent.endDate),
            now,
            nudgeWindow.isPrimaryCurrent,
          )
        : "";

  const bannerTitle =
    nudgeWindow.primary?.title?.trim() ||
    nudgePrimaryGridEvent?.title ||
    "Untitled event";

  const primaryLabel = nudgeConferenceUrl ? "Join" : "Open";
  const primaryShortcut = nudgeConferenceUrl ? "V" : "N";
  const onPrimary = nudgeConferenceUrl
    ? openConference
    : () => openEventDetails("gridClick");

  return (
    <div
      aria-atomic="true"
      className="fixed bottom-6 left-1/2 flex w-72 -translate-x-1/2 starting:translate-y-2 items-center gap-3 rounded-lg border border-border bg-surface-panel/80 px-3 py-2 text-sm text-text starting:opacity-0 shadow-xl backdrop-blur-md transition-all duration-300 ease-out data-closing:opacity-0 motion-reduce:transition-none"
      data-closing={closing || undefined}
      data-up-next-banner=""
      role="status"
      style={{ zIndex: Z_INDEX_FLOATING_MENU }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-text-muted text-xs">{countdown}</div>
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-accent"
          />
          <span className="truncate font-medium">{bannerTitle}</span>
        </div>
      </div>
      <TooltipWrapper
        description={nudgeConferenceUrl ? "Join meeting" : "Open Up Next event"}
        shortcut={nudgeConferenceUrl ? "V" : "N"}
        shortcutId={nudgeConferenceUrl ? "nav-join-meeting" : "nav-up-next"}
      >
        <button
          className="c-focus-ring flex shrink-0 items-center gap-1.5 rounded bg-accent-secondary px-2 py-1 font-medium text-on-accent"
          onClick={onPrimary}
          type="button"
        >
          {primaryLabel}
          <ShortcutHint>{primaryShortcut}</ShortcutHint>
        </button>
      </TooltipWrapper>
      <TooltipWrapper description="Dismiss banner" shortcut="Esc">
        <button
          aria-label="Dismiss"
          className="c-focus-ring shrink-0 rounded-xs px-1 text-text-muted hover:text-text"
          onClick={dismiss}
          type="button"
        >
          &times;
        </button>
      </TooltipWrapper>
    </div>
  );
};
