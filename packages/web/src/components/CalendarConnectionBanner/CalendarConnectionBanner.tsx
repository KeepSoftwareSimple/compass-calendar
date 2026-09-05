import { type FC } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { type CalendarConnectionBannerKind } from "@web/auth/google/hooks/useConnectGoogle/useConnectGoogle.util";
import { RECONNECT_BANNER_MESSAGE } from "@web/auth/providers/provider-copy.util";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  POINTER_ACTION_ATTRIBUTE,
  POINTER_ACTIONS,
  pointerShortcutAttributes,
} from "@web/shortcuts/keyboard-only/pointer-action";
import {
  CONNECTION_BANNER_SHORTCUT_KEY,
  useNoticeActionShortcut,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

const COPY: Record<
  CalendarConnectionBannerKind,
  { message: string; action: string }
> = {
  reconnect: {
    message: RECONNECT_BANNER_MESSAGE.google,
    action: "Reconnect",
  },
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
      ? { message: RECONNECT_BANNER_MESSAGE[provider], action: "Reconnect" }
      : COPY[kind];
  const isError = kind === "reconnect" || kind === "importFailed";
  const pointerAction =
    kind === "reconnect" ? POINTER_ACTIONS.reconnectGoogle : undefined;

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
          ? { [POINTER_ACTION_ATTRIBUTE]: pointerAction }
          : {})}
      >
        {action}
        <ShortcutKeys keys={CONNECTION_BANNER_SHORTCUT_KEY} />
      </button>
    </div>
  );
};
