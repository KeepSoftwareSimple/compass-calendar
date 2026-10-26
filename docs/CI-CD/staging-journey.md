# Staging journey cron

Nightly Playwright run against `https://staging.compasscalendar.com` only.
Workflow: [`.github/workflows/staging-journey.yml`](../../.github/workflows/staging-journey.yml).

Create GitHub Environment `staging-journey` with:

| Secret | Purpose |
|---|---|
| `DISCORD_ERRORS_WEBHOOK_URL` | Failure notifications (same pattern as live provider smoke) |
| `STAGING_JOURNEY_GOOGLE_EMAIL` | Google leg signup/login email |
| `STAGING_JOURNEY_GOOGLE_PASSWORD` | Google leg password |
| `STAGING_JOURNEY_MICROSOFT_EMAIL` | Microsoft leg email |
| `STAGING_JOURNEY_MICROSOFT_PASSWORD` | Microsoft leg password |
| `STAGING_JOURNEY_APPLE_EMAIL` | Apple leg email |
| `STAGING_JOURNEY_APPLE_PASSWORD` | Apple leg password |

Each matrix leg sets `STAGING_JOURNEY_PROVIDER` and fails fast when that leg's
email/password secrets are missing.

## Synthetic accounts

Journey signups are tagged server-side (`isSynthetic`, PostHog
`$internal_or_test_user` and `is_synthetic`), excluded from welcome email and
billing funnel analytics, and marked with the `X-Compass-Synthetic-Account:
true` header from Playwright.

On **staging-cloud**, set GitHub Environment variable
`SYNTHETIC_JOURNEY_EMAILS` to the same base addresses as the journey secrets
(comma-separated, e.g. `lance.essert@gmail.com`). Deploy writes
`journeys.syntheticEmails` into `compass.yaml` so plus-tagged signups match
the base. Production uses the same variable when prod journey is enabled.
For prod journey checkout, set `stripe.syntheticJourneyDiscountId` to a 100%
off Stripe coupon or promotion code id (`STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID`
in deploy env).
