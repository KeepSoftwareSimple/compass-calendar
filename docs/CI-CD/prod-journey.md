# Prod journey (synthetic)

Manual Playwright run against `https://compasscalendar.com` for Tyler-approved
synthetic accounts only. Workflow:
[`.github/workflows/prod-journey.yml`](../../.github/workflows/prod-journey.yml).

`workflow_dispatch` only. Add a cron after test logins and
`STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID` are in place and Tyler OKs production
scheduling.

Create GitHub Environment `prod-journey` with:

| Secret | Purpose |
|---|---|
| `DISCORD_ERRORS_WEBHOOK_URL` | Failure notifications |
| `PROD_JOURNEY_GOOGLE_EMAIL` | Google leg base email |
| `PROD_JOURNEY_GOOGLE_PASSWORD` | Google leg password |
| `PROD_JOURNEY_MICROSOFT_EMAIL` | Microsoft leg email |
| `PROD_JOURNEY_MICROSOFT_PASSWORD` | Microsoft leg password |
| `PROD_JOURNEY_APPLE_EMAIL` | Apple leg email |
| `PROD_JOURNEY_APPLE_PASSWORD` | Apple leg password |
| `STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID` | Stripe `coupon_…` or `promo_…` for 100% off |

Production backend deploy config must also set:

| Deploy env / yaml | Purpose |
|---|---|
| `SYNTHETIC_JOURNEY_EMAILS` | Same base emails as the secrets above (comma-separated), e.g. `lance.essert+prod-journey-google@gmail.com,lance.essert+prod-journey-microsoft@gmail.com,lance.essert+prod-journey-apple@gmail.com` |
| `STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID` | Same discount id as the `prod-journey` Environment secret (written to `stripe.syntheticJourneyDiscountId`; applied only for synthetic accounts) |

Add `STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID` to the **production** GitHub
Environment under the same name as `prod-journey` (copy the value once in the
GitHub UI; deploy references the secret, it does not embed the coupon id).

The spec completes embedded Checkout without a card: production checkout uses
`payment_method_collection: if_required` with the 100% journey discount, fills
billing address when Stripe Tax requires it, then submits. It cancels the
subscription in Settings, continues logout/login, and always deletes the account
in a `finally` block (including after failures). Accounts are tagged synthetic
server-side and must not receive welcome email or pollute billing funnels.

After email signup the calendar uses the explore-first trial path: the spec
opens `?auth=trial` (same as staging signup trial capture), then embedded
Checkout. Production must deploy `STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID` so
synthetic journey inboxes stay on `awaiting_checkout` instead of the staging
write bypass.

Failed workflow runs upload `e2e/test-results/` for seven days via
`actions/upload-artifact` (`if: always()`).
