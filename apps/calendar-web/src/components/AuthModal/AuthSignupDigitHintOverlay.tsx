import { type RefObject } from "react";
import { createPortal } from "react-dom";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import {
  AUTH_SIGNUP_FIELD_DIGITS,
  type AuthSignupFocusField,
} from "@web/components/AuthModal/auth-signup-digit.fields";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { getVisibleHintRect } from "@web/shortcuts/shift-hint/shift-hint-visible-rect";
import { useHintLayoutRefresh } from "@web/shortcuts/useHintLayoutRefresh";

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
  useHintLayoutRefresh(visible);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  const presentFields = AUTH_SIGNUP_FIELD_DIGITS.flatMap((entry) => {
    const anchor = fieldRefs[entry.field].current;
    return anchor ? [{ ...entry, anchor }] : [];
  });

  const srText = `Jump where? ${presentFields
    .map((entry) => `${entry.digit} for ${entry.label.toLowerCase()}`)
    .join(", ")}. Release the modifier to dismiss.`;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0"
      data-auth-signup-digit-hints=""
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <span aria-live="polite" className="sr-only" role="status">
        {srText}
      </span>
      <div aria-hidden>
        {presentFields.map((entry) => {
          const visibleRect = getVisibleHintRect(entry.anchor);
          if (!visibleRect) {
            return null;
          }

          const chipWidth = 22;

          return (
            <span
              key={entry.field}
              className="absolute"
              style={{
                top: visibleRect.top + 2,
                left: Math.max(4, visibleRect.right - chipWidth),
              }}
            >
              <ShortcutHint>{entry.digit}</ShortcutHint>
            </span>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
