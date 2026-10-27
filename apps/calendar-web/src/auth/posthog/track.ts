import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";

/**
 * Product activation catalog (untyped here; funnel modules own property shapes).
 *
 * Signup funnel (`signup-funnel.ts`):
 * - `signup_started`: `source`, `anon_events_created`
 * - `local_mode_selected`: `source` (anonymous local-only choice, not a login)
 * - `signup_completed`: `method`
 * - `signup_step_viewed`: `step_name`, `step` (same value), optional `source`,
 *   `method` (includes trial and Google OAuth scopes recovery steps)
 * - `google_oauth_scopes_recovery_viewed`: `provider`
 * - `google_oauth_scopes_recovery_retry_clicked`: `provider`, `missing_scope_count`
 * - `google_oauth_scopes_recovery_succeeded`: `provider`
 * - `signup_failed`: `reason_code`, optional `method`, `step`, `error`
 *
 * OAuth signup drop-off (server + client; `packages/core/src/analytics/oauth-signup.events.ts`):
 * - `oauth_redirect_started`: `provider`, `intent`
 * - `oauth_callback_received`: `provider`
 * - `oauth_failed`: `provider`, `reason`, optional `provider_error`
 *
 * Billing:
 * - `trial_converted`: `source`, optional `feature_area`, `action_id`, `trial`
 * - `checkout_opened`: `source` (embedded Checkout mounted)
 * - `checkout_back`: `source` (Back or Esc from embedded Checkout)
 */
export type ProductEvent =
  | "welcome_modal_shown"
  | "welcome_modal_dismissed"
  | "welcome_step_viewed"
  | "signup_started"
  | "local_mode_selected"
  | "signup_completed"
  | "oauth_redirect_started"
  | "oauth_callback_received"
  | "oauth_failed"
  | "oauth_return"
  | "signup_step_viewed"
  | "google_oauth_scopes_recovery_viewed"
  | "google_oauth_scopes_recovery_retry_clicked"
  | "google_oauth_scopes_recovery_succeeded"
  | "signup_failed"
  | "login_completed"
  | "logout_completed"
  | "account_deleted"
  | "event_created"
  | "event_edited"
  | "event_deleted"
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
  | "connect_prompt_shown"
  | "connect_prompt_clicked"
  | "connect_prompt_dismissed"
  | "trial_converted"
  | "trial_celebration_shown"
  | "checkout_opened"
  | "checkout_back"
  | "billing_gate_shown"
  | "billing_gate_cta_clicked"
  | "billing_gate_shortcut_converted"
  | "trial_gate_triggered"
  | "billing_cancel_scheduled"
  | "subscription_cancel_reason_submitted"
  | "billing_resumed"
  | "billing_card_update_completed"
  | "shortcut_upgrade_prompted"
  | "notifications_enabled"
  | "notifications_disabled"
  | "notifications_enable_denied"
  | "notifications_shown"
  | "notifications_show_failed"
  | "notifications_permission"
  | "notifications_scheduled"
  | "notifications_fired"
  | "notifications_skipped"
  | "shortcut_suggestion_shown"
  | "shortcut_invoked"
  | "shortcut_suggestion_engaged"
  | "hint_shortcut_first_used"
  | "shortcut_unavailable_attempt"
  | "shortcut_level_up"
  | "shortcut_level_badge_toggled"
  | "pointer_hint_shown"
  | "pointer_hint_dismissed"
  | "empty_grid_click_hint_shown"
  | "life_view_intro_shown"
  | "life_view_intro_dismissed"
  | "booking_settings_opened"
  | "booking_page_enabled"
  | "booking_link_copied"
  | "booking_page_viewed"
  | "booking_reservation_created"
  | "booking_reservation_cancelled"
  | "booking_reservation_rescheduled"
  | "booking_new_meetings_toast_shown"
  | "booking_new_meetings_toast_clicked"
  | "booking_setup_step_viewed"
  | "booking_setup_step_completed"
  | "booking_setup_save_succeeded"
  | "booking_setup_save_failed"
  | "booking_slots_loaded"
  | "booking_slot_selected"
  | "booking_details_reached"
  | "booking_submit_attempted"
  | "booking_submit_failed"
  | "booking_landing_viewed"
  | "booking_setup_cta_clicked";

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
