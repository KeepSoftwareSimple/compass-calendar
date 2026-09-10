import { Check, Copy } from "@phosphor-icons/react";
import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import IconButton from "@web/components/IconButton/IconButton";
import { pointerPassAttributes } from "@web/shortcuts/keyboard-only/pointer-action";

const COPIED_RESET_MS = 1500;
const ICON_SIZE = 16;

export interface CopyButtonProps {
  /** Text written to the clipboard on click. */
  text: string;
  /** Accessible name, e.g. "copy guest@example.com". */
  label: string;
  className?: string;
  /** Called after a successful copy. */
  onCopied?: () => void;
}

/**
 * Small copy icon beside a copyable value. Low opacity by default, full opacity
 * on hover and keyboard focus. Swaps to a checkmark briefly after copying.
 */
export function CopyButton({
  text,
  label,
  className,
  onCopied,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const handleCopy = () => {
    if (!text.trim()) return;

    void copyText(text).then((didCopy) => {
      if (!didCopy) return;
      onCopied?.();
      setCopied(true);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(
        () => setCopied(false),
        COPIED_RESET_MS,
      );
    });
  };

  const ariaLabel = copied ? "Copied" : label;

  return (
    <IconButton
      {...pointerPassAttributes}
      aria-label={ariaLabel}
      className={classNames(
        "shrink-0 opacity-25 transition-opacity hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
      disabled={!text.trim()}
      onClick={(event) => {
        event.stopPropagation();
        handleCopy();
      }}
      onKeyDown={(event) => {
        // Nested in chips/comboboxes, Enter/Space must not bubble to a parent
        // that preventDefault's them (which would block the native button click).
        if (event.key === "Enter" || event.key === " ") {
          event.stopPropagation();
        }
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      size="small"
      tabIndex={0}
      type="button"
    >
      {copied ? <Check size={ICON_SIZE} /> : <Copy size={ICON_SIZE} />}
    </IconButton>
  );
}
