import { type FC, useCallback, useContext, useEffect } from "react";
import { PH_NO_RAGECLICK_CLASS } from "@web/auth/posthog/posthog-calendar-grid.util";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import { BottomNotice } from "@web/components/BottomNoticeStack/BottomNotice";
import { BOTTOM_NOTICE_QUEUE_ID } from "@web/components/BottomNoticeStack/bottom-notice.constants";
import { useBottomNoticeQueue } from "@web/components/BottomNoticeStack/useBottomNoticeQueue";
import { localModeConnectPromptActions } from "@web/components/LocalModeConnectPrompt/local-mode-connect.store";
import { useLocalModeConnectPromptEligible } from "@web/components/LocalModeConnectPrompt/useLocalModeConnectPromptEligible";
import {
  TOAST_PRIMARY_ACTION_KEY,
  useNoticeActionShortcut,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

export const LOCAL_MODE_CONNECT_PROMPT_ARIA_LABEL = "Start your free trial";

export const LOCAL_MODE_CONNECT_PROMPT_MESSAGE =
  "Start your free trial to save this calendar on every device.";

export const LOCAL_MODE_CONNECT_PROMPT_CONNECT_LABEL = "Start free trial";

export const LocalModeConnectPrompt: FC = () => {
  const { isOpen: isAuthModalOpen, openModal } = useContext(AuthModalContext);
  const { isLive, writeCount } =
    useLocalModeConnectPromptEligible(isAuthModalOpen);
  const { closing, beginDismiss } = useDismissTransition(BANNER_DISMISS_MS);
  const visibleInQueue = useBottomNoticeQueue(
    BOTTOM_NOTICE_QUEUE_ID.localModeConnect,
    isLive,
  );

  const dismiss = useCallback(() => {
    beginDismiss(() => localModeConnectPromptActions.dismiss(writeCount));
  }, [beginDismiss, writeCount]);

  const startTrial = useCallback(() => {
    localModeConnectPromptActions.connect(writeCount);
    openModal("signUp");
  }, [openModal, writeCount]);

  useEffect(() => {
    localModeConnectPromptActions.syncFromStorage();
  }, []);

  useEffect(() => {
    if (!isLive) return;
    localModeConnectPromptActions.markShown(writeCount);
  }, [isLive, writeCount]);

  useNoticeActionShortcut(TOAST_PRIMARY_ACTION_KEY, startTrial, {
    enabled: visibleInQueue && !closing,
  });

  useAppShortcut("Escape", dismiss, {
    enabled: visibleInQueue && !closing,
    ignoreAppLock: true,
    preventDefault: true,
  });

  if (!visibleInQueue) return null;

  return (
    <BottomNotice
      ariaLabel={LOCAL_MODE_CONNECT_PROMPT_ARIA_LABEL}
      className={PH_NO_RAGECLICK_CLASS}
      closing={closing}
      data-local-mode-connect-prompt=""
      message={LOCAL_MODE_CONNECT_PROMPT_MESSAGE}
      onDismiss={dismiss}
      onPrimary={startTrial}
      primaryLabel={LOCAL_MODE_CONNECT_PROMPT_CONNECT_LABEL}
      primaryShortcutKeys={TOAST_PRIMARY_ACTION_KEY}
    />
  );
};
