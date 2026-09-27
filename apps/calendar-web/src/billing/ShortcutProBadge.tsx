export const SHORTCUT_PRO_BADGE_LABEL = "Premium";
export const SHORTCUT_PRO_TOOLTIP = "Included with Premium";

/**
 * Compact plan chip for locked write shortcuts. The surrounding control owns
 * the accessible name and tooltip; this is visual decoration only.
 */
export function ShortcutProBadge({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center rounded border border-border px-1.5 py-px font-medium text-text-muted text-xs leading-none ${className}`.trim()}
    >
      {SHORTCUT_PRO_BADGE_LABEL}
    </span>
  );
}
