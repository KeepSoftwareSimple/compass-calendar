#!/usr/bin/env bash
# Writes the optional email: block for compass.yaml deploy generation.
# Sourced from _deploy-environment.yml; tested via deploy-email-config.test.ts.

email_config_status_line() {
  echo "provider=${EMAIL_PROVIDER:-empty}; apiKey=$([ -n "${EMAIL_API_KEY:-}" ] && echo present || echo empty); from=$([ -n "${EMAIL_FROM:-}" ] && echo present || echo empty); webhookSecret=$([ -n "${EMAIL_WEBHOOK_SECRET:-}" ] && echo present || echo empty); unsubscribeSecret=$([ -n "${EMAIL_UNSUBSCRIBE_SECRET:-}" ] && echo present || echo empty)"
}

resend_email_config_complete() {
  [ -n "${EMAIL_PROVIDER:-}" ] &&
    [ "$EMAIL_PROVIDER" = "resend" ] &&
    [ -n "${EMAIL_API_KEY:-}" ] &&
    [ -n "${EMAIL_FROM:-}" ] &&
    [ -n "${EMAIL_WEBHOOK_SECRET:-}" ] &&
    [ -n "${EMAIL_UNSUBSCRIBE_SECRET:-}" ]
}

# Production welcome drip is launch-critical. Hosted production deploys must
# not succeed while the email block would be omitted (see #4361).
require_production_email_config() {
  if [ "${DEPLOY_ENVIRONMENT:-}" != "production" ]; then
    return 0
  fi

  if ! resend_email_config_complete; then
    echo "Production deploy requires a complete Resend email block in the GitHub production Environment." >&2
    echo "Set variables: EMAIL_PROVIDER=resend, EMAIL_FROM (e.g. Compass <hello@mail.compasscalendar.com>)." >&2
    echo "Set secrets: EMAIL_API_KEY, EMAIL_WEBHOOK_SECRET, EMAIL_UNSUBSCRIBE_SECRET (copy from staging-cloud or Resend dashboard)." >&2
    echo "Leave EMAIL_ALLOWLIST unset so real signups receive mail; use EMAIL_SCHEDULE_PROFILE=real or omit it." >&2
    echo "Current production email inputs: $(email_config_status_line)" >&2
    return 1
  fi

  if [ -n "${EMAIL_ALLOWLIST:-}" ]; then
    echo "Production deploy must not set EMAIL_ALLOWLIST (staging guard only). Unset it on the production Environment." >&2
    return 1
  fi

  if [ "${EMAIL_SCHEDULE_PROFILE:-}" = "fast" ]; then
    echo "Production deploy must not use EMAIL_SCHEDULE_PROFILE=fast (staging only)." >&2
    return 1
  fi

  return 0
}

write_email_block() {
  if ! resend_email_config_complete; then
    echo "Email config: omitting email block ($(email_config_status_line))" >&2
    return 0
  fi

  echo "Email config: writing email block (provider=${EMAIL_PROVIDER})" >&2
  printf '%s\n' 'email:' "  provider: ${EMAIL_PROVIDER}"
  if [ "$EMAIL_PROVIDER" = "resend" ]; then
    printf '%s\n' \
      "  apiKey: \"${EMAIL_API_KEY}\"" \
      "  from: \"${EMAIL_FROM}\"" \
      "  webhookSecret: \"${EMAIL_WEBHOOK_SECRET}\"" \
      "  unsubscribeSecret: \"${EMAIL_UNSUBSCRIBE_SECRET}\""
  fi

  if [ -n "$EMAIL_SCHEDULE_PROFILE" ]; then
    printf '%s\n' "  scheduleProfile: ${EMAIL_SCHEDULE_PROFILE}"
  fi

  if [ -n "$EMAIL_ALLOWLIST" ]; then
    allowlist_seq=$(printf '%s' "$EMAIL_ALLOWLIST" |
      tr ',' '\n' |
      sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e 's/.*/"&"/' |
      paste -sd, -)
    printf '%s\n' "  allowlist: [${allowlist_seq}]"
    echo "Email config: ${EMAIL_ALLOWLIST} on the send allowlist" >&2
  fi
}
