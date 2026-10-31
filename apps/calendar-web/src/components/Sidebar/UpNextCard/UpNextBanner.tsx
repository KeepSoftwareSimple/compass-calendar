import { type FC, useState } from "react";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import dayjs from "@core/util/date/dayjs";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { NoticeCard } from "@web/components/BottomNoticeStack/NoticeCard";
import { NoticeDismissButton } from "@web/components/BottomNoticeStack/NoticeDismissButton";
import { NoticePrimaryButton } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
import { formatEventStatus } from "@web/components/Sidebar/UpNextCard/UpNextCard";
import { useUpNextEvent } from "@web/components/Sidebar/UpNextCard/useUpNextEvent";
import { useUpNextOsNotification } from "@web/components/Sidebar/UpNextCard/useUpNextOsNotification";
import { useAppShortcutUp } from "@web/shortcuts/useAppShortcut";

const MINUTES_BEFORE_START = 2;

export const UpNextBanner: FC = () => {
  const { now, openEventDetails, upNext, conferenceUrl, isCurrentEvent } =
    useUpNextEvent();
  const [dismissedId, setDismissedId] = useState<string | undefined>(undefined);
  const { closing, beginDismiss } = useDismissTransition(BANNER_DISMISS_MS);

  const isWithinWindow =
    Boolean(upNext) &&
    (isCurrentEvent ||
      dayjs(upNext?.startDate).diff(now, "minute", true) <=
        MINUTES_BEFORE_START);
  const isVisible = isWithinWindow && upNext?._id !== dismissedId;

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

  const openConference = () =>
    window.open(conferenceUrl, "_blank", "noopener,noreferrer");

  const dismiss = () => {
    beginDismiss(() => setDismissedId(upNext?._id));
  };

  const upNextShortcuts = APP_SHORTCUT_BINDINGS;
  useAppShortcutUp(
    upNextShortcuts.navUpNext.hotkey,
    () => openEventDetails("keyboardEdit"),
    { shortcutId: "nav-up-next" },
  );
  useAppShortcutUp(upNextShortcuts.navJoinMeeting.hotkey, openConference, {
    enabled: Boolean(conferenceUrl),
    shortcutId: "nav-join-meeting",
  });
  useAppShortcutUp("Escape", dismiss, { enabled: isVisible });

  if (!isVisible || !upNext) {
    return null;
  }

  const countdown = formatEventStatus(
    dayjs(upNext.startDate),
    dayjs(upNext.endDate),
    now,
    isCurrentEvent,
  );

  const primaryLabel = conferenceUrl ? "Join" : "Open";
  const primaryShortcut = conferenceUrl ? "V" : "N";
  const onPrimary = conferenceUrl
    ? openConference
    : () => openEventDetails("gridClick");

  return (
    <NoticeCard
      ariaLabel="Up next event"
      aria-live="polite"
      closing={closing}
      data-up-next-banner=""
      role="status"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-text-muted text-xs">{countdown}</div>
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-accent"
            />
            <span className="truncate font-medium text-sm">{upNext.title}</span>
          </div>
        </div>
        <NoticeDismissButton onClick={dismiss} />
      </div>
      <NoticePrimaryButton onClick={onPrimary} shortcutKeys={primaryShortcut}>
        {primaryLabel}
      </NoticePrimaryButton>
    </NoticeCard>
  );
};
