import { useEffect, useRef, useState } from "react";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";

const COPIED_RESET_MS = 2000;

/**
 * Shared "Copy" button state: copy the text, hold `copied` for two seconds.
 * `onResult` runs with the copy outcome so callers can add their own feedback
 * (a toast host-side, nothing guest-side - the inline status text suffices).
 */
export function useCopiedFlag(
  text: string,
  onResult?: (didCopy: boolean) => void,
) {
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

  const copy = () => {
    void copyText(text).then((didCopy) => {
      onResult?.(didCopy);
      if (!didCopy) {
        return;
      }
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

  return { copied, copy };
}
