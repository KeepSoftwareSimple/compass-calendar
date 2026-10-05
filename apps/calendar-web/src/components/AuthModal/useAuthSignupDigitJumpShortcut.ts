import { type RefObject } from "react";
import {
  AUTH_SIGNUP_FIELD_DIGITS_BY_KEY,
  type AuthSignupFocusField,
} from "@web/components/AuthModal/auth-signup-digit.fields";
import { physicalDigitIndex } from "@web/shortcuts/digit-pick.util";
import { useModHoldHintShortcut } from "@web/shortcuts/mod-hold/useModHoldHintShortcut";

type FieldRefs = Record<
  AuthSignupFocusField,
  RefObject<HTMLInputElement | null>
>;

/**
 * Mod+digit focuses a sign-up field (1=name, 2=email, 3=password). Holding
 * Mod reveals numbered chips via AuthSignupDigitHintOverlay.
 */
export function useAuthSignupDigitJumpShortcut(
  fieldRefs: FieldRefs,
  enabled: boolean,
): { areHintsVisible: boolean } {
  return useModHoldHintShortcut({
    enabled,
    holdMs: 0,
    ignoreAppLock: true,
    onModChord: (event) => {
      const index = physicalDigitIndex(event);
      const entry =
        index !== null ? AUTH_SIGNUP_FIELD_DIGITS_BY_KEY[index] : undefined;
      if (!entry) return false;

      fieldRefs[entry.field].current?.focus();
      return true;
    },
  });
}
