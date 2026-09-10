import { CheckIcon } from "@phosphor-icons/react";
import { type FC, useEffect, useRef } from "react";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import {
  CALENDAR_HOST_EXPLAINER,
  CONNECT_CALENDAR_BENEFITS,
  CONNECT_CALENDAR_REASSURANCE,
  CONNECT_CALENDAR_WHY,
  CONNECT_THE_CALENDAR_YOU_USE,
} from "@web/auth/providers/provider-copy.util";
import { MODAL_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { connectCalendarPromptActions } from "@web/components/ConnectCalendarPrompt/connect-calendar.store";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { pointerPassAttributes } from "@web/shortcuts/keyboard-only/pointer-action";

// Names the consequence rather than just offering an exit, so skipping is an
// informed choice instead of a reflex. It comes back in a week either way.
export const CONNECT_CALENDAR_LATER_LABEL =
  "Skip for now, my calendar stays empty";

export const ConnectCalendarPrompt: FC = () => {
  const { closing, beginDismiss } = useDismissTransition(MODAL_DISMISS_MS);
  const skipFocusRestoreRef = useRef(false);

  const dismiss = () => beginDismiss(connectCalendarPromptActions.snooze);

  useEffect(() => {
    connectCalendarPromptActions.markShown();
  }, []);

  return (
    <OverlayPanel
      align="start"
      ariaLabel={CONNECT_THE_CALENDAR_YOU_USE}
      backdropClassName="overflow-y-auto py-8"
      closing={closing}
      onDismiss={dismiss}
      skipFocusRestoreRef={skipFocusRestoreRef}
      widthClassName="w-120"
    >
      <div className="flex w-full flex-col gap-6" {...pointerPassAttributes}>
        <div className="flex w-full flex-col gap-2">
          <h2 className="font-bold text-2xl text-text leading-snug">
            {CONNECT_THE_CALENDAR_YOU_USE}
          </h2>
          <p className="text-sm text-text-muted">{CONNECT_CALENDAR_WHY}</p>
        </div>
        <ul className="flex w-full flex-col gap-1.5 text-sm text-text">
          {CONNECT_CALENDAR_BENEFITS.map((benefit) => (
            <li className="flex items-start gap-2" key={benefit}>
              <CheckIcon
                aria-hidden
                className="mt-0.5 shrink-0 text-accent"
                size={16}
                weight="bold"
              />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        <ConnectProviderChooser variant="prompt" />
        <div className="flex w-full flex-col gap-1">
          <p className="text-text-muted text-xs">
            {CONNECT_CALENDAR_REASSURANCE}
          </p>
          <p className="text-text-muted text-xs">{CALENDAR_HOST_EXPLAINER}</p>
        </div>
        <button
          className="c-focus-ring self-center rounded-md px-2 py-1 text-text-muted text-xs hover:bg-surface-overlay hover:text-text"
          onClick={dismiss}
          type="button"
        >
          {CONNECT_CALENDAR_LATER_LABEL}
        </button>
      </div>
    </OverlayPanel>
  );
};
