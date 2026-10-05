import { PICK_KEY_LABELS } from "@core/shortcuts/digit-pick.constants";

/** Sign-up form fields in DOM order for Mod+digit focus jumps (1–3). */
export const AUTH_SIGNUP_FIELD_DIGITS = [
  { field: "name", label: "Name", digit: "1" },
  { field: "email", label: "Email", digit: "2" },
  { field: "password", label: "Password", digit: "3" },
] as const;

export type AuthSignupFocusField =
  (typeof AUTH_SIGNUP_FIELD_DIGITS)[number]["field"];

/** Sorted by physical top-row key order for index lookup from `physicalDigitIndex`. */
export const AUTH_SIGNUP_FIELD_DIGITS_BY_KEY = [
  ...AUTH_SIGNUP_FIELD_DIGITS,
].sort(
  (a, b) => PICK_KEY_LABELS.indexOf(a.digit) - PICK_KEY_LABELS.indexOf(b.digit),
);
