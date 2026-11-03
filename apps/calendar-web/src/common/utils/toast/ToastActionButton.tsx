import { type ReactNode } from "react";
import { NOTICE_PRIMARY_BUTTON_CLASS } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
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
