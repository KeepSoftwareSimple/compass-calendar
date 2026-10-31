import { type ReactNode } from "react";
import { NOTICE_PRIMARY_BUTTON_CLASS } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

/** Pre-#4987 contextual prompt CTAs (accent fill, not bottom-stack primary). */
export const CONTEXTUAL_TOAST_ACTION_CLASS =
  "flex w-full items-center justify-center gap-2 rounded bg-accent-secondary px-3 py-2 font-medium text-on-accent text-sm transition-colors hover:bg-accent-secondary-hover";

import {
  type NoticeActionKey,
  TOAST_PRIMARY_ACTION_KEY,
  useNoticeActionShortcut,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

export function ToastActionButton({
  children,
  onClick,
  shortcutKey = TOAST_PRIMARY_ACTION_KEY,
}: {
  children: ReactNode;
  onClick: () => void;
  shortcutKey?: NoticeActionKey;
}) {
  useNoticeActionShortcut(shortcutKey, onClick);

  return (
    <button
      className={`${NOTICE_PRIMARY_BUTTON_CLASS} w-full self-stretch`}
      onClick={onClick}
      type="button"
    >
      {children}
      <ShortcutKeys keys={shortcutKey} />
    </button>
  );
}

export function ContextualToastActionButton({
  children,
  onClick,
  shortcutKey = TOAST_PRIMARY_ACTION_KEY,
}: {
  children: ReactNode;
  onClick: () => void;
  shortcutKey?: NoticeActionKey;
}) {
  useNoticeActionShortcut(shortcutKey, onClick);

  return (
    <button
      className={CONTEXTUAL_TOAST_ACTION_CLASS}
      onClick={onClick}
      type="button"
    >
      {children}
      <ShortcutKeys keys={shortcutKey} />
    </button>
  );
}
