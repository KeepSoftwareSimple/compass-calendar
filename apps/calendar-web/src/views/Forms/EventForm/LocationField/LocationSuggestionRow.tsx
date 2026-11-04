import classNames from "classnames";
import { type ReactNode } from "react";

export const LOCATION_SUGGESTION_ROW_CLASS =
  "flex min-h-10 w-full items-center px-3 py-2 text-left text-sm";

interface LocationSuggestionRowProps {
  children: ReactNode;
  className?: string;
}

/** Shared row height for suggestions, loading, empty, and error states. */
export function LocationSuggestionRow({
  children,
  className,
}: LocationSuggestionRowProps) {
  return (
    <div className={classNames(LOCATION_SUGGESTION_ROW_CLASS, className)}>
      {children}
    </div>
  );
}
