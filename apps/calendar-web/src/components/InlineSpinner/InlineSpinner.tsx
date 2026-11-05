import cn from "classnames";

const SIZE_CLASS = {
  sm: "size-3.5",
  md: "size-4",
} as const;

const RING_CLASS = {
  default: "border-border border-t-text",
  subtle: "border-text-subtle/30 border-t-text-muted",
} as const;

interface InlineSpinnerProps {
  /**
   * Accessible name. Omit when the surrounding row already announces the busy
   * state, which renders the spinner decorative instead.
   */
  label?: string;
  ring?: keyof typeof RING_CLASS;
  size?: keyof typeof SIZE_CLASS;
}

/**
 * Small ring spinner for inline busy states inside a row or list.
 * Full-surface loading uses PixelCompass through AbsoluteOverflowLoader.
 */
export function InlineSpinner({
  label,
  ring = "default",
  size = "md",
}: InlineSpinnerProps) {
  return (
    <span
      {...(label
        ? { "aria-label": label, role: "progressbar" }
        : { "aria-hidden": true })}
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 motion-reduce:animate-none",
        SIZE_CLASS[size],
        RING_CLASS[ring],
      )}
    />
  );
}
