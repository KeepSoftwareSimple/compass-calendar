import classNames from "classnames";
import { type ReactNode } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

/** Matches first-event and other compact primary CTAs in the notice stack. */
export const NOTICE_PRIMARY_BUTTON_CLASS =
  "c-button-compact c-button-primary inline-flex items-center justify-center gap-2 self-start rounded-xs px-3 py-1.5 text-s";

export function NoticePrimaryButton({
  children,
  className,
  onClick,
  shortcutKeys,
}: {
  children: ReactNode;
  className?: string;
  onClick: () => void;
  shortcutKeys?: string | readonly string[];
}) {
  return (
    <button
      className={classNames(NOTICE_PRIMARY_BUTTON_CLASS, className)}
      onClick={onClick}
      type="button"
    >
      {children}
      {shortcutKeys ? (
        <ShortcutKeys
          keys={
            typeof shortcutKeys === "string" ? shortcutKeys : [...shortcutKeys]
          }
        />
      ) : null}
    </button>
  );
}
