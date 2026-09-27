import { type FC, useContext } from "react";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import { ConnectCalendarPrompt } from "@web/components/ConnectCalendarPrompt/ConnectCalendarPrompt";
import { useConnectCalendarPromptSurfaceEligible } from "@web/components/ConnectCalendarPrompt/useConnectCalendarPromptSurfaceEligible";

export const ConnectCalendarPromptGate: FC = () => {
  const { isOpen: isAuthModalOpen } = useContext(AuthModalContext);
  const isLive = useConnectCalendarPromptSurfaceEligible(isAuthModalOpen);

  if (!isLive) return null;

  return <ConnectCalendarPrompt />;
};
