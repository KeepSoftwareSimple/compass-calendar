import {
  type FocusEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FORM_FIELD_DIGITS } from "@core/shortcuts/edit-sequence.fields";
import {
  type EventFormFocusField,
  eventFormFieldFromTarget,
} from "@web/common/utils/form/form.util";
import { pulseClickTaughtShortcut } from "@web/shortcuts/pointer-intent/pulseClickTaughtShortcut";

const POINTER_FOCUS_MS = 300;
const DIGIT_CHIP_MS = 1500;

/**
 * When the user focuses a form field with the pointer, flash that field's
 * digit chip and teach Mod+digit once per field per form open.
 */
export function usePointerFormFieldDigitTeach(): {
  digitFlashField: EventFormFocusField | null;
  onFormPointerDown: () => void;
  onFormFocusIn: (event: FocusEvent<HTMLElement>) => void;
} {
  const [digitFlashField, setDigitFlashField] =
    useState<EventFormFocusField | null>(null);
  const pointerDownAtRef = useRef<number | null>(null);
  const taughtFieldsRef = useRef(new Set<EventFormFocusField>());
  const hideTimerRef = useRef<
    ReturnType<typeof globalThis.setTimeout> | undefined
  >(undefined);

  useEffect(
    () => () => {
      if (hideTimerRef.current !== undefined) {
        globalThis.clearTimeout(hideTimerRef.current);
      }
    },
    [],
  );

  const onFormPointerDown = useCallback(() => {
    pointerDownAtRef.current = Date.now();
  }, []);

  const onFormFocusIn = useCallback((event: FocusEvent<HTMLElement>) => {
    const pointerDownAt = pointerDownAtRef.current;
    pointerDownAtRef.current = null;
    if (pointerDownAt === null) return;
    if (Date.now() - pointerDownAt > POINTER_FOCUS_MS) return;

    const field = eventFormFieldFromTarget(event.target);
    if (!field || taughtFieldsRef.current.has(field)) return;

    const digit = FORM_FIELD_DIGITS.find(
      (entry) => entry.field === field,
    )?.digit;
    if (!digit) return;

    taughtFieldsRef.current.add(field);
    setDigitFlashField(field);
    if (hideTimerRef.current !== undefined) {
      globalThis.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = globalThis.setTimeout(() => {
      hideTimerRef.current = undefined;
      setDigitFlashField(null);
    }, DIGIT_CHIP_MS);

    pulseClickTaughtShortcut("edit-jump-field-digit", {
      shortcutKey: ["Mod", digit],
    });
  }, []);

  return { digitFlashField, onFormPointerDown, onFormFocusIn };
}
