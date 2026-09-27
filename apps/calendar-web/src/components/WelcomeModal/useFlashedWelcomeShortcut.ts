import { useEffect, useRef, useState } from "react";
import {
  selectPointerHintAttempt,
  selectPointerHintPulse,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";

export const KEYCAP_FLASH_MS = 700;

/** The shortcut key currently flashing after a click, or null. */
export function useFlashedWelcomeShortcut(): string | null {
  const pulse = usePointerHintStore(selectPointerHintPulse);
  const attempt = usePointerHintStore(selectPointerHintAttempt);
  const [flashedKey, setFlashedKey] = useState<string | null>(null);
  const lastPulseRef = useRef(pulse);

  useEffect(() => {
    if (pulse === lastPulseRef.current) return;
    lastPulseRef.current = pulse;
    const shortcut = attempt?.shortcutKey;
    const flashKey =
      typeof shortcut === "string"
        ? shortcut
        : (shortcut?.[shortcut.length - 1] ?? null);
    if (!flashKey) {
      setFlashedKey(null);
      return;
    }
    setFlashedKey(flashKey);
    const timer = window.setTimeout(() => setFlashedKey(null), KEYCAP_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [pulse, attempt?.shortcutKey]);

  return flashedKey;
}

export const flashedShortcutClass = (
  flashedKey: string | null,
  key: string,
): string =>
  flashedKey?.toLowerCase() === key.toLowerCase() ? "c-keycap-flash" : "";
