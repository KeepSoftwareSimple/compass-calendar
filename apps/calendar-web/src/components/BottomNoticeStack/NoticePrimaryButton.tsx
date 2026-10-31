import classNames from "classnames";
import { type ReactNode } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

/** Compact bottom-notice primary: ~28px tall, `text-m` label, medium weight. */
export const NOTICE_PRIMARY_BUTTON_CLASS =
  "c-button-compact c-button-primary inline-flex h-7 min-h-7 items-center justify-center gap-1 rounded-xs px-2 text-m font-medium [&_.c-keycap]:min-h-0 [&_.c-keycap]:border-on-accent/35 [&_.c-keycap]:bg-on-accent/10 [&_.c-keycap]:px-1 [&_.c-keycap]:py-0 [&_.c-keycap]:text-m [&_.c-keycap]:text-on-accent";

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
          className="gap-0.5"
          keys={
            typeof shortcutKeys === "string" ? shortcutKeys : [...shortcutKeys]
          }
        />
      ) : null}
    </button>
  );
}
