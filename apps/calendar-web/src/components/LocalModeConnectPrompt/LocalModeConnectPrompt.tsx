import { type FC, useCallback, useContext, useEffect } from "react";
import { PH_NO_RAGECLICK_CLASS } from "@web/auth/posthog/posthog-calendar-grid.util";
import { BANNER_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import { NoticeCard } from "@web/components/BottomNoticeStack/NoticeCard";
import { NoticeDismissButton } from "@web/components/BottomNoticeStack/NoticeDismissButton";
import { NoticePrimaryButton } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
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
    enabled: isLive && !closing,
  });

  useAppShortcut("Escape", dismiss, {
    enabled: isLive && !closing,
    ignoreAppLock: true,
    preventDefault: true,
  });

  if (!isLive) return null;

  return (
    <NoticeCard
      ariaLabel={LOCAL_MODE_CONNECT_PROMPT_ARIA_LABEL}
      className={PH_NO_RAGECLICK_CLASS}
      closing={closing}
      data-local-mode-connect-prompt=""
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-relaxed">
          {LOCAL_MODE_CONNECT_PROMPT_MESSAGE}
        </p>
        <NoticeDismissButton onClick={dismiss} />
      </div>
      <NoticePrimaryButton
        onClick={startTrial}
        shortcutKeys={TOAST_PRIMARY_ACTION_KEY}
      >
        {LOCAL_MODE_CONNECT_PROMPT_CONNECT_LABEL}
      </NoticePrimaryButton>
    </NoticeCard>
  );
};
