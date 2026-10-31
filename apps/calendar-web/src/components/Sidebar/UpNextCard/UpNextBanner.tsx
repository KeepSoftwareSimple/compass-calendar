import { type FC, useState } from "react";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import dayjs from "@core/util/date/dayjs";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { BottomNotice } from "@web/components/BottomNoticeStack/BottomNotice";
import { BOTTOM_NOTICE_QUEUE_ID } from "@web/components/BottomNoticeStack/bottom-notice.constants";
import { useBottomNoticeQueue } from "@web/components/BottomNoticeStack/useBottomNoticeQueue";
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
  const isCandidate = isWithinWindow && upNext?._id !== dismissedId;
  const eligible = Boolean(isCandidate && upNext && !closing);
  const visible = useBottomNoticeQueue(BOTTOM_NOTICE_QUEUE_ID.upNext, eligible);

  useUpNextOsNotification(
    upNext?._id
      ? {
          _id: upNext._id,
          title: upNext.title,
          startDate: upNext.startDate,
        }
      : undefined,
    visible,
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
    { enabled: visible, shortcutId: "nav-up-next" },
  );
  useAppShortcutUp(upNextShortcuts.navJoinMeeting.hotkey, openConference, {
    enabled: visible && Boolean(conferenceUrl),
    shortcutId: "nav-join-meeting",
  });
  useAppShortcutUp("Escape", dismiss, { enabled: visible });

  if (!visible || !upNext) {
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

  const message = `${countdown} · ${upNext.title}`;

  return (
    <BottomNotice
      ariaLabel="Up next event"
      aria-live="polite"
      closing={closing}
      data-up-next-banner=""
      message={message}
      onDismiss={dismiss}
      onPrimary={onPrimary}
      primaryLabel={primaryLabel}
      primaryShortcutKeys={primaryShortcut}
      role="status"
    />
  );
};
