import classNames from "classnames";
import { type ReactNode } from "react";

/** Fixed 16px column so pin / camera / people icons share a left edge. */
export const FORM_CARD_ICON_COLUMN_CLASSNAME =
  "flex size-4 shrink-0 items-center justify-center text-text-muted";

/** Input inside a form-card icon row: no horizontal inset (see INPUT_RESET px-2). */
export const FORM_CARD_FIELD_INPUT_CLASSNAME =
  "h-auto min-h-0 min-w-0 flex-1 border-0 bg-transparent px-0 text-indent-0 text-sm text-text outline-none placeholder:text-text-muted";

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

/** Visible text start (placeholder or value) for layout parity tests. */
export function formCardFieldTextStartX(field: HTMLElement): number {
  const rect = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const pad =
    Number.parseFloat(style.paddingLeft) +
    Number.parseFloat(style.textIndent || "0");
  return rect.left + pad;
}
