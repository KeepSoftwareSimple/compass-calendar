import { type ReactNode } from "react";

interface BookingCheckboxRowProps {
  checked: boolean;
  children: ReactNode;
  onChange: (checked: boolean) => void;
}

/**
 * The checkbox-and-label row the booking settings use five times over: every
 * blocking calendar (grouped and ungrouped alike) and each buffer/limit
 * option. They were five copies of the same markup, so a class tweak on one
 * silently left the others behind.
 */
export function BookingCheckboxRow({
  checked,
  children,
  onChange,
}: BookingCheckboxRowProps) {
  return (
    <label className="flex min-h-8 items-center gap-2 text-sm text-text">
      <input
        checked={checked}
        className="c-all-day-checkbox"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {children}
    </label>
  );
}
