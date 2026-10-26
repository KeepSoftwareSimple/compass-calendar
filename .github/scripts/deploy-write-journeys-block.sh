#!/usr/bin/env bash
# Writes the optional journeys: block for compass.yaml deploy generation.
# Sourced from _deploy-environment.yml; tested via deploy-journey-config.test.ts.

write_journeys_block() {
  if [ -z "${SYNTHETIC_JOURNEY_EMAILS:-}" ]; then
    echo "Journeys config: omitting journeys block (SYNTHETIC_JOURNEY_EMAILS unset)" >&2
    return 0
  fi

  synthetic_seq=$(printf '%s' "$SYNTHETIC_JOURNEY_EMAILS" |
    tr ',' '\n' |
    sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e 's/.*/"&"/' |
    paste -sd, -)
  printf '%s\n' 'journeys:' "  syntheticEmails: [${synthetic_seq}]"
  echo "Journeys config: synthetic journey bases configured (${SYNTHETIC_JOURNEY_EMAILS})" >&2
}
