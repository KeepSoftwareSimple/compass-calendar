import classNames from "classnames";
import { type ReactNode } from "react";

/** Fixed 16px column so pin / camera / people icons share a left edge. */
export const FORM_CARD_ICON_COLUMN_CLASSNAME =
  "flex size-4 shrink-0 items-center justify-center text-text-muted";

interface FormCardIconRowProps {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Icon-led row inside a {@link FormCard}: muted icon column, content aligned
 * to the same text start as sibling rows (no input horizontal padding).
 */
export function FormCardIconRow({
  icon,
  children,
  className,
}: FormCardIconRowProps) {
  return (
    <div className={classNames("flex min-h-8 items-center gap-2", className)}>
      <span className={FORM_CARD_ICON_COLUMN_CLASSNAME}>{icon}</span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}
