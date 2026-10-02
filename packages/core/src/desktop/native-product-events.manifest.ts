/**
 * Product events the native macOS app emits today. Every other name in
 * `apps/calendar-web/src/auth/posthog/track.ts` is web-only until a native call
 * site is added here and `bun cli desktop:export` is rerun.
 */
export const NATIVE_PRODUCT_EVENT_CALL_SITES = [
  "login_completed",
  "shortcut_invoked",
  "shortcut_level_up",
  "shortcut_level_badge_toggled",
] as const;
