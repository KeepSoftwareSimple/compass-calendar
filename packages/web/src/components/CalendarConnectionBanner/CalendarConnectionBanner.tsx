import { type FC } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import {
  type CalendarConnectionBannerKind,
  calendarReconnectBannerMessage,
} from "@web/auth/providers/connect.util";
import { CONSENT_REQUIRED_COPY } from "@web/auth/providers/provider-copy.util";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  POINTER_ACTION_ATTRIBUTE,
  POINTER_ACTIONS,
  POINTER_PROVIDER_ATTRIBUTE,
  pointerShortcutAttributes,
} from "@web/shortcuts/keyboard-only/pointer-action";
import {
  CONNECTION_BANNER_SHORTCUT_KEY,
  useNoticeActionShortcut,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

const STATIC_COPY: Record<
  Exclude<CalendarConnectionBannerKind, "reconnect" | "consentRequired">,
  { message: string; action: string }
> = {
  importFailed: {
    message: "Couldn't add your calendar.",
    action: "Retry",
  },
  delayed: {
    message: "Calendar updates are delayed.",
    action: "Refresh",
  },
};

interface CalendarConnectionBannerProps {
  kind: CalendarConnectionBannerKind;
  onAction: () => void;
  provider?: ProviderKind;
}

export const CalendarConnectionBanner: FC<CalendarConnectionBannerProps> = ({
  kind,
  onAction,
  provider = "google",
}) => {
  const { message, action } =
    kind === "reconnect"
      ? {
          message: calendarReconnectBannerMessage(provider),
          action: "Reconnect",
        }
      : kind === "consentRequired"
        ? {
            message: CONSENT_REQUIRED_COPY,
            action: "Reconnect",
          }
        : STATIC_COPY[kind];
  const isError =
    kind === "reconnect" ||
    kind === "consentRequired" ||
    kind === "importFailed";
  const pointerAction =
    kind === "reconnect" || kind === "consentRequired"
      ? POINTER_ACTIONS.reconnectGoogle
      : undefined;

  useNoticeActionShortcut(CONNECTION_BANNER_SHORTCUT_KEY, onAction);

  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-sm ${
        isError
          ? "border-error/40 bg-error/10 text-text"
          : "border-warning/40 bg-warning/10 text-text"
      }`}
      data-notice=""
      role={isError ? "alert" : "status"}
    >
      <p>{message}</p>
      <button
        className="c-focus-ring inline-flex shrink-0 items-center gap-2 rounded-xs px-2 py-1 font-medium text-text hover:bg-surface-overlay"
        onClick={onAction}
        type="button"
        {...pointerShortcutAttributes(CONNECTION_BANNER_SHORTCUT_KEY)}
        {...(pointerAction
          ? {
              [POINTER_ACTION_ATTRIBUTE]: pointerAction,
              [POINTER_PROVIDER_ATTRIBUTE]: provider,
            }
          : {})}
      >
        {action}
        <ShortcutKeys keys={CONNECTION_BANNER_SHORTCUT_KEY} />
      </button>
    </div>
  );
};
