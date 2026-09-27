import classNames from "classnames";
import { type ReactNode } from "react";

export function ShortcutHint({
  children,
  title,
  className = "",
  variant = "keycap",
}: {
  children: ReactNode;
  title?: string;
  className?: string;
  variant?: "keycap" | "plain";
}) {
  return (
    <span
      title={title}
      className={classNames(
        variant === "keycap"
          ? "c-keycap"
          : "inline-flex items-center text-text-muted text-xs",
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}
