import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";

export type ProductEvent =
  | "welcome_modal_shown"
  | "welcome_modal_dismissed"
  | "welcome_step_viewed"
  | "signup_started"
  | "signup_completed"
  | "oauth_redirect_started"
  | "signup_step_viewed"
  | "signup_failed"
  | "login_completed"
  | "event_created"
  | "calendar_connected"
  | "shortcut_showcase_started"
  | "shortcut_showcase_skipped"
  | "shortcut_showcase_finished"
  | "shortcut_game_run_started"
  | "shortcut_game_task_shown"
  | "shortcut_game_task_completed"
  | "shortcut_game_task_skipped"
  | "shortcut_game_hint_shown"
  | "shortcut_game_replayed"
  | "mobile_game_started"
  | "mobile_game_level_completed"
  | "mobile_game_finished"
  | "mobile_game_skipped"
  | "mobile_gate_link_copied"
  | "mobile_gate_waitlist_clicked"
  | "first_event_prompt_shown"
  | "first_event_prompt_completed"
  | "first_event_prompt_dismissed"
  | "connect_calendar_prompt_dismissed"
  | "trial_converted"
  | "trial_celebration_shown"
  | "billing_gate_shown"
  | "billing_gate_cta_clicked"
  | "billing_gate_shortcut_converted"
  | "billing_cancel_scheduled"
  | "billing_resumed"
  | "billing_card_update_completed"
  | "shortcut_upgrade_prompted"
  | "notifications_enabled"
  | "notifications_disabled"
  | "notifications_enable_denied"
  | "notifications_shown"
  | "notifications_show_failed"
  | "shortcut_suggestion_shown"
  | "shortcut_invoked"
  | "shortcut_suggestion_engaged"
  | "shortcut_unavailable_attempt"
  | "pointer_hint_shown"
  | "pointer_hint_dismissed"
  | "booking_settings_opened"
  | "booking_page_enabled"
  | "booking_link_copied"
  | "booking_page_viewed"
  | "booking_reservation_created";

export type ProductEventProperties = Record<string, boolean | number | string>;

/**
 * Fire-and-forget capture for the small set of product-activation events.
 * No-ops when PostHog isn't initialized (disabled, or not yet booted).
 */
export function track(
  event: ProductEvent,
  properties?: ProductEventProperties,
): void {
  try {
    getPosthogClient()?.capture(event, properties);
  } catch {
    // Analytics must never interrupt the product action it observes. The SDK
    // owns transport retries and unload flushing for successfully queued data.
  }
}
