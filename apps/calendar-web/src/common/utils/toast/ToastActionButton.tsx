import { type ReactNode } from "react";
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
      className="flex w-full items-center justify-center gap-2 rounded bg-accent-secondary px-3 py-2 font-medium text-on-accent text-sm transition-colors hover:bg-accent-secondary-hover"
      onClick={onClick}
      type="button"
    >
      {children}
      <ShortcutKeys keys={shortcutKey} />
    </button>
  );
}
