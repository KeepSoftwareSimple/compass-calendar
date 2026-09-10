import classNames from "classnames";
import { type FC, useCallback, useSyncExternalStore } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  shouldShowAnonymousCalendarChangeSignUpPrompt,
  subscribeToAuthState,
} from "@web/auth/compass/state/auth.state.util";
import { trackSignupStarted } from "@web/auth/posthog/signup-funnel";
import { useAuthModal } from "@web/components/AuthModal/hooks/useAuthModal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@web/components/Tooltip/Tooltip";

const ANONYMOUS_SAVE_MESSAGE = "Sign up to save your changes across browsers";

const TOOLTIP_ACTION_BUTTON_CLASSNAME =
  "c-button-compact c-button-primary self-start rounded-xs px-2 py-1 text-s";

interface AnonymousCalendarRowProps {
  calendar: Calendar;
}

export const AnonymousCalendarRow: FC<AnonymousCalendarRowProps> = ({
  calendar,
}) => {
  const { openModal } = useAuthModal();
  const isDirty = useSyncExternalStore(
    subscribeToAuthState,
    shouldShowAnonymousCalendarChangeSignUpPrompt,
    shouldShowAnonymousCalendarChangeSignUpPrompt,
  );
  const handleOpenSignUp = useCallback(() => {
    trackSignupStarted("anon_nudge");
    openModal("signUp");
  }, [openModal]);

  return (
    <li className="flex min-w-0 items-center gap-1">
      <Tooltip interactive>
        <TooltipTrigger asChild>
          <button
            aria-label="Sign up to save this calendar"
            className={classNames(
              "c-focus-ring flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-xs",
              isDirty
                ? "c-sync-text-wave"
                : "text-text-muted hover:bg-surface-panel hover:text-text",
            )}
            onClick={handleOpenSignUp}
            type="button"
          >
            <span
              aria-hidden
              className="size-3.5 shrink-0 rounded-full border-2"
              style={{
                backgroundColor: calendar.backgroundColor,
                borderColor: calendar.backgroundColor,
              }}
            />
            <span className="min-w-0 flex-1 truncate">This browser</span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="flex max-w-55 flex-col gap-1.5">
          <span>{ANONYMOUS_SAVE_MESSAGE}</span>
          <button
            className={TOOLTIP_ACTION_BUTTON_CLASSNAME}
            onClick={handleOpenSignUp}
            type="button"
          >
            Sign up
          </button>
        </TooltipContent>
      </Tooltip>
    </li>
  );
};
