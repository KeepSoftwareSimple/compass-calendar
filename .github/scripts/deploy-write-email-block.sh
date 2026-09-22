#!/usr/bin/env bash
# Writes the optional email: block for compass.yaml deploy generation.
# Sourced from _deploy-environment.yml; tested via deploy-email-config.test.ts.

write_email_block() {
  if [ -z "$EMAIL_PROVIDER" ]; then
    echo "Email config: omitting email block (provider empty; apiKey=$([ -n "$EMAIL_API_KEY" ] && echo present || echo empty); from=$([ -n "$EMAIL_FROM" ] && echo present || echo empty); webhookSecret=$([ -n "$EMAIL_WEBHOOK_SECRET" ] && echo present || echo empty); unsubscribeSecret=$([ -n "$EMAIL_UNSUBSCRIBE_SECRET" ] && echo present || echo empty))" >&2
    return 0
  fi

  if [ "$EMAIL_PROVIDER" = "resend" ]; then
    if [ -z "$EMAIL_API_KEY" ] || [ -z "$EMAIL_FROM" ] || [ -z "$EMAIL_WEBHOOK_SECRET" ] || [ -z "$EMAIL_UNSUBSCRIBE_SECRET" ]; then
      echo "Email config: omitting email block (provider=${EMAIL_PROVIDER}; apiKey=$([ -n "$EMAIL_API_KEY" ] && echo present || echo empty); from=$([ -n "$EMAIL_FROM" ] && echo present || echo empty); webhookSecret=$([ -n "$EMAIL_WEBHOOK_SECRET" ] && echo present || echo empty); unsubscribeSecret=$([ -n "$EMAIL_UNSUBSCRIBE_SECRET" ] && echo present || echo empty))" >&2
      return 0
    fi
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
