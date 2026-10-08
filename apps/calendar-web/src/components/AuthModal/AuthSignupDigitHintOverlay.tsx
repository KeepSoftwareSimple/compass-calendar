import { type RefObject } from "react";
import {
  AUTH_SIGNUP_FIELD_DIGITS,
  type AuthSignupFocusField,
} from "@web/components/AuthModal/auth-signup-digit.fields";
import {
  type DigitHintChip,
  DigitHintChipOverlay,
} from "@web/shortcuts/hint-chips/DigitHintChipOverlay";

type FieldRefs = Record<
  AuthSignupFocusField,
  RefObject<HTMLInputElement | null>
>;

/**
 * Numbered keycap chips on the sign-up fields while Mod is held
 * (see useAuthSignupDigitJumpShortcut).
 */
export function AuthSignupDigitHintOverlay({
  visible,
  fieldRefs,
}: {
  visible: boolean;
  fieldRefs: FieldRefs;
}) {
  const resolveChips = (): DigitHintChip[] =>
    AUTH_SIGNUP_FIELD_DIGITS.flatMap((entry) => {
      const anchor = fieldRefs[entry.field].current;
      return anchor
        ? [{ key: entry.field, digit: entry.digit, label: entry.label, anchor }]
        : [];
    });

  return (
    <DigitHintChipOverlay
      resolveChips={resolveChips}
      rootAttribute="data-auth-signup-digit-hints"
      srPrompt="Jump where?"
      visible={visible}
    />
  );
}
