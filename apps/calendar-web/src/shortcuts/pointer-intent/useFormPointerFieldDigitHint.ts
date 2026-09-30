import { useEffect, useRef } from "react";
import { ID_EVENT_FORM } from "@web/common/constants/web.constants";
import {
  type EventFormFocusField,
  getEventFormFieldAnchor,
} from "@web/common/utils/form/form.util";
import { FORM_FIELD_DIGITS } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { pulseClickTaughtShortcut } from "@web/shortcuts/pointer-intent/pulse-click-taught-shortcut";
import { expandModInShortcutDisplay } from "@web/shortcuts/shortcut.util";

const POINTER_FOCUS_WINDOW_MS = 300;
const DIGIT_CHIP_VISIBLE_MS = 1500;

const modHoldLabelForHint = (): string =>
  expandModInShortcutDisplay("Mod") === "Meta" ? "Cmd" : "Ctrl";

export function useFormPointerFieldDigitHint(
  onFlashField: (field: EventFormFocusField | null) => void,
): void {
  const pointerDownAt = useRef<number | null>(null);
  const shownFields = useRef(new Set<EventFormFocusField>());
  const hideTimer = useRef<
    ReturnType<typeof globalThis.setTimeout> | undefined
  >(undefined);

  useEffect(() => {
    shownFields.current.clear();
    if (hideTimer.current !== undefined) {
      globalThis.clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
    onFlashField(null);
  }, [onFlashField]);

  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>(
      `form[name="${ID_EVENT_FORM}"]`,
    );
    if (!form) return;

    const clearFlashTimer = () => {
      if (hideTimer.current !== undefined) {
        globalThis.clearTimeout(hideTimer.current);
        hideTimer.current = undefined;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") {
        pointerDownAt.current = Date.now();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const downAt = pointerDownAt.current;
      pointerDownAt.current = null;
      if (downAt === null || Date.now() - downAt > POINTER_FOCUS_WINDOW_MS) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) return;

      for (const entry of FORM_FIELD_DIGITS) {
        const anchor = getEventFormFieldAnchor(entry.field);
        if (!anchor?.contains(target)) continue;
        if (shownFields.current.has(entry.field)) return;

        shownFields.current.add(entry.field);
        clearFlashTimer();
        onFlashField(entry.field);
        hideTimer.current = globalThis.setTimeout(() => {
          hideTimer.current = undefined;
          onFlashField(null);
        }, DIGIT_CHIP_VISIBLE_MS);

        pulseClickTaughtShortcut("edit-jump-field-digit", {
          message: `Next time: ${modHoldLabelForHint()}+${entry.digit}`,
        });
        return;
      }
    };

    form.addEventListener("pointerdown", onPointerDown, true);
    form.addEventListener("focusin", onFocusIn, true);
    return () => {
      form.removeEventListener("pointerdown", onPointerDown, true);
      form.removeEventListener("focusin", onFocusIn, true);
      clearFlashTimer();
    };
  }, [onFlashField]);
}
