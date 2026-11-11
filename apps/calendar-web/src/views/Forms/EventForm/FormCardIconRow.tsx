import classNames from "classnames";
import { type ReactNode } from "react";

/** Shared with location inputs and guest combobox (`text-sm` / 20px line). */
export const FORM_CARD_FIELD_FONT_SIZE = "0.875rem";
export const FORM_CARD_FIELD_LINE_HEIGHT = "1.25rem";

/** Matches `text-sm` first line (`leading-5`); icons center on this line box. */
export const FORM_CARD_ICON_ROW_LINE_CLASSNAME = "h-5 leading-5";

/** Fixed 16px-wide column; height is one text line so icons line up with row copy. */
export const FORM_CARD_ICON_COLUMN_CLASSNAME = classNames(
  "flex w-4 shrink-0 items-center justify-center text-text-muted",
  FORM_CARD_ICON_ROW_LINE_CLASSNAME,
);

/** Input inside a form-card icon row: no horizontal inset (see INPUT_RESET px-2). */
export const FORM_CARD_FIELD_INPUT_CLASSNAME =
  "h-auto min-h-0 min-w-0 flex-1 border-0 bg-transparent px-0 text-indent-0 text-sm leading-5 text-text outline-none placeholder:text-text-muted";

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
    <div
      className={classNames(
        "flex min-h-8 items-start gap-2",
        FORM_CARD_ICON_ROW_LINE_CLASSNAME,
        className,
      )}
    >
      <span className={FORM_CARD_ICON_COLUMN_CLASSNAME}>{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
