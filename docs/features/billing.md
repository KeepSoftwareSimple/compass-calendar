# Billing And Trial

Hosted Compass uses Stripe **embedded** Checkout (subscription mode, 7-day
trial) rendered inside the app, and a Compass-built Settings > Billing view
for the card on file, cancel or resume, and receipts. The subscription
amount lives on the Stripe Price behind `stripe.priceId`, so operators can
change it in Stripe without a web deploy. Stripe.js loads lazily from
`js.stripe.com` on the first checkout surface (the gate or Update card);
the publishable key is served by `/api/config` as `billing.publishableKey`
and is never baked into the web bundle.

Self-host installs omit the `stripe:` config block. `/api/config` then reports
`billing.isConfigured: false`, the web never shows a paid gate, and event
writes stay open.

## Pausing enforcement

`billing.enforcement` is a separate, independent switch — the operator's global
kill switch for turning the whole trial/billing product on or off, regardless
of whether Stripe is configured. It defaults to `false` (paused): every user,
signed in or not, sees `{kind: "open"}` from `useAppAccess`, no trial badge, no
gate modal, and `assertBillingAllowsWrites` no-ops
even with valid Stripe keys present. This lets Stripe keys and Checkout/webhook
work stay live in an environment while the product feels free to every user.

Set it via `billing.enforcement: true` in `compass.yaml`, or the
`BILLING_ENFORCEMENT` GitHub Environment var for hosted deploys. Flipping it
requires a redeploy (or `./compass restart` if the yaml is already current) —
it is read once at backend startup, not polled. Web-side, it flows through
`/api/config`, which is fetched asynchronously and fails open: a pending or
errored config request always reads as paused, never as enforced, so a slow
network never flashes a gate at a user before the real value loads.

**Enable-day caveat:** existing signed-in accounts are not grandfathered (see
below) — flipping `enforcement: true` while Stripe is configured immediately
puts any hosted user without a Stripe subscription id and without a local
trial into `awaiting_checkout` and shows them `BillingGateModal`. Neither
`backfill-billing` nor `BACKFILL_CUTOFF` changes that — see below. Sparing a
whole cohort would take a real code change, so treat the flip as the moment
every hosted account without a Stripe subscription or local trial goes
read-only. Individual accounts can be exempted, though — see the next
section.

## Bypassing enforcement for specific accounts

`billing.bypassEmails` is a narrower escape hatch than the global pause: a list
of email addresses that skip the gate while enforcement stays genuinely on for
everyone else. It exists for test accounts that cannot complete a real Stripe
Checkout — staging smoke checks, QA sweeps, automated sessions verifying a
change against a deployed environment.

```yaml
billing:
  enforcement: true
  bypassEmails: ["qa@example.com"]
```

Hosted deploys set the `BILLING_BYPASS_EMAILS` GitHub Environment var to a
comma-separated list; the deploy workflow writes it into the remote yaml. Like
`enforcement`, it is read once at backend startup — the backend logs
`Billing bypass: N account(s)` on boot so a redeploy can be confirmed.

Two places consult the list, both after the enforcement and Stripe-configured
checks, so it can only ever narrow access:

- `assertBillingAllowsWrites` returns early, so event writes succeed.
- `GET /api/billing/status` reports `active` / `isReadOnly: false`, so
  `useAppAccess` resolves to a writable server session and `RootShell` renders
  the app instead of `BillingGateModal`.

Matching is case- and whitespace-insensitive. Nothing is written to the user
document — the account's stored `billing` is untouched, so removing an address
from the list restores the real gate on the next restart.

The roster is deliberately **not** exposed through `/api/config`: that payload
is public and unauthenticated, and putting addresses in it would leak the list.
Only the signed-in account learns it is bypassed.

**This is a real payment bypass.** It is operator config only, never
user-supplied, and empty by default. Set it on staging; leave it unset in
production.

## What users see

- **Never signed up:** fully open, forever. Anonymous visitors get the seeded
  sample events and the whole app with no clock and no gate. There is no
  browser-local trial: a trial is only ever asked for at the moment of
  commitment (sign up, sign in, connect an account).
- **Signed up, no card yet (new accounts):** a local 7-day trial starts at
  signup. `GET /api/billing/status` returns `trialing`, `needsPaymentMethod:
  true`, `isReadOnly: false`, and `trialEndsAt` seven days out. There is no
  Stripe subscription until they add a card. Checkout while at least 48 hours
  remain on that local trial passes `subscription_data.trial_end` equal to
  `trialEndsAt` (Stripe's minimum remaining trial) and keeps
  `trial_settings.end_behavior.missing_payment_method: "cancel"`. Checkout in
  the last 48 hours, or after expiry, charges immediately with no trial. After
  `trialEndsAt` the same account reports `expired` and is read-only until they
  subscribe.
- **Signed up, no card yet (legacy `awaiting_checkout`):** unchanged.
  Read-only, `BillingGateModal` with Start trial. Checkout happens inside the
  gate: Start trial (`S`) mounts Stripe embedded Checkout in the same overlay.
  Completion raises the celebration through `onComplete`; the webhook remains
  the source of truth and a short poll of `GET /api/billing/status` waits for
  it. The gate also offers "Look around first" (`L`), which unmounts it and
  drops the user onto the real calendar behind `BillingReadOnlyBanner`. That
  preview lives in `billing-preview.store.ts` and is deliberately in-memory, so
  a reload puts the trial ask back. Writes still fail server-side, and the
  `BILLING_REQUIRED` branch in `useEventMutations` exits the preview, so the
  first refused save brings the gate straight back. That refusal does not
  show the catch-all "something went wrong" toast — the gate is the feedback.
  Google reconnect and delayed-sync toasts also wait until Look around (or a
  write): they must not sit on top of Start trial. These accounts have no
  `trialStartedAt`, so Checkout still grants `trial_period_days: 7`.
- **Trialing:** writable, with a days-left badge in the sidebar month picker
  header (`TrialBadge.tsx`, via `DatePicker`'s `headerEndContent` slot). The
  badge carries no `tabindex`: `getPageJumpFocusElement` seats Mod+2 on the
  first `[tabindex="0"]` inside the picker, and a tab stop here would steal
  that jump. Press `B` (keycap-styled in the badge tooltip and on Settings →
  Billing) to subscribe early. That shortcut is registered by
  `UpgradeConfirmationProvider` and keeps working while Settings is open.
  Local (card-less) trials use Checkout rather than `POST /api/billing/trial/end`;
  Stripe-backed trials still end via that endpoint.
- **Active / past_due:** writable. `past_due` also shows a banner whose CTA
  opens Settings on Billing with Update card already mounted.
- **Expired / canceled:** read-only until they subscribe again. A later
  Checkout does not grant another trial.

There is no `POST /api/billing/trial/start`. New accounts begin a local trial
at signup. Legacy `awaiting_checkout` accounts still begin a Stripe trial only
through Checkout (`trial_period_days` on the first subscription). Sessions
use `ui_mode: "embedded"` and `redirect_on_completion: "never"`, so
Checkout stays inside Compass. Redirect-based payment methods are therefore
unavailable by design.

A trial can be *ended* early through `POST /api/billing/trial/end`, which calls
`subscriptions.update(trial_end: "now")` and writes the returned Subscription
through the webhook's own `applySubscription`, so status is fresh in the same
response and the Stripe field mapping stays in one place. Three ways in, all
gated on a running trial: the badge, a "Subscribe now" palette command, and
bare `B`. "Manage billing" on that confirm dialog opens Settings on Billing;
it does not charge today and does not end the trial. A declined card lands
on `past_due` (still writable), so the confirm dialog reports the resulting
status instead of a blanket success.

**Settings > Billing** (`PlanSection.tsx`) is the management view. It shows
the plan badge, price from the Stripe Price (minor units formatted in the
browser), renews or ends date, and the card on file (`{Brand} ending in
{last4}, expires MM/YY`, or "No card on file"). From there:

- **Update card** (`U`) mounts a setup-mode embedded Checkout session
  (`POST /api/billing/payment-method/session`). The webhook
  `checkout.session.completed` for `mode: "setup"` sets the default payment
  method on the Customer and Subscription. After `onComplete`, Compass toasts
  "Card updated" and polls until Settings shows the new last4.
- **Cancel subscription** (`C`) schedules cancel at period end. Trialing
  copy: access continues until the trial ends. Toast: "Your plan ends on
  {date}". **Resume subscription** (`R`) appears while `cancelAtPeriodEnd`
  is set.
- **Receipts:** up to 12 invoices, linking to Stripe-hosted PDFs
  (`target="_blank"`). The heading is hidden when the list is empty. A $0.00
  trial invoice still appears.

Deliberate exclusions: no address or tax ID editing in Compass, and no
redirect-based payment methods (`redirect_on_completion: "never"`). Sales
tax is still collected at Checkout (see Staging).

## Account deletion

Deleting an account from Settings → Accounts deletes Compass calendars, events,
settings, authentication data, browser storage, and Sync-held Google
credentials. It never deletes Google Calendar data itself.

For an account that reached Stripe Checkout, deletion first deletes its Stripe
Customer. That immediately cancels any trial or subscription and removes saved
payment details; Stripe retains the financial history it is required to keep.
If Stripe cannot confirm that deletion, Compass leaves the account intact and
asks the user to try again from a dialog, rather than risk a later charge.
Previous payments are not refunded automatically.

Sync may be temporarily unavailable during deletion. Compass records the
principal purge and retries it every ten minutes until Sync confirms its cached
data and provider credentials are gone. This queue contains only the Compass
principal id, not calendar content or credentials.

Stripe webhook event ids are retained for 35 days for replay protection, then
expire automatically. They contain only the Stripe event id and receipt time.

Existing accounts are not grandfathered. Hosted users without a Stripe
subscription id and without a local trial (including missing billing, `none`,
and `trialing` rows with no `trialEndsAt`) derive as `awaiting_checkout` and
see the Start-trial gate. A `trialing` row with a future `trialEndsAt` and no
Stripe id is the card-less local trial: writable, `needsPaymentMethod: true`,
then `expired` after that date. Legacy `awaiting_checkout` accounts stay
read-only; granting them a local trial is out of scope.
`bun run cli backfill-billing` stamps `awaiting_checkout` on rows that still
lack `billing.subscriptionStatus`. The default `BACKFILL_CUTOFF` is far in
the future so every such row is included; set it to a past instant to skip
newer signups.

`BACKFILL_CUTOFF` is **not** a grandfathering switch. It only decides which
rows get *stamped*, and `deriveBillingStatus` already gates a missing
`billing` object through the same `awaiting_checkout` branch — so stamped and
unstamped rows are equally read-only. Running the backfill makes the state
explicit for reporting; it grants nobody access. New signups begin a local
trial at insert. Legacy accounts still begin a Stripe trial only through
Checkout.

## Staging

Set all four Stripe GitHub Environment variables on `staging-cloud`, then
**re-run Deploy staging** so `~/compass/compass.yaml` is rewritten. A restart
on old yaml will not pick up new secrets. Confirm `/api/config` shows
`billing.isConfigured: true` and a non-null `billing.publishableKey`.

- `STRIPE_SECRET_KEY` (`sk_test_...` is fine)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_PUBLISHABLE_KEY` (`pk_test_...` is fine)

All four are required together. If any is missing, the deploy omits the
`stripe:` block and hosted billing stays off.

The webhook endpoint (`https://staging.compasscalendar.com/api/billing/webhook/stripe`)
must subscribe to Checkout and Subscriptions snapshot events, not Accounts v2:

- `checkout.session.completed` (subscription Checkout and setup-mode card
  updates both arrive on this event; setup-mode has `mode: "setup"`)
- `checkout.session.expired` (analytics only: the user reached Stripe and
  left; nothing is written to `billing.*`)
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

`staging-selfhosted` must not get those secrets — it is the live regression
that self-host stays writable.

The webhook also emits server-side PostHog events keyed by the Compass user id
(the same distinct id the web app identifies with): `checkout_completed` after
a subscription-mode Checkout lands, and `checkout_expired` when one lapses
unpaid. They are best-effort; a PostHog failure never fails the webhook. The
browser's `trial_converted` only fires on the success redirect, so these are
the events the billing funnel should trust.

Sales tax is enabled in code: the Checkout Session passes
`automatic_tax`, `customer_update.address`, and `billing_address_collection`
together (all three are required when an existing `customer` is passed). The
Dashboard half is the part that must be settled before production keys —
register each jurisdiction under Tax > Registrations and set a product tax
code, in test and live mode separately. Without a registration Stripe
calculates zero tax rather than erroring, so a missing one is silent.

### Manual QA checklist (founder, on staging-cloud)

Do this after every prior embedded-billing package is deployed. Use a real
signed-in hosted account that is not on the bypass list.

1. **Happy path:** Start trial with `4242 4242 4242 4242` (any future expiry,
   any CVC). Checkout stays inside the gate. Celebration appears. Status
   becomes `trialing`.
2. **3DS:** Start trial with `4000 0025 0000 3155`. Complete 3DS inside the
   Stripe iframe (do not leave Compass). Celebration still fires through
   `onComplete`.
3. **Decline:** `4000 0000 0000 9995` is rejected inside the iframe. The gate
   stays up; no celebration; status stays `awaiting_checkout`.
4. **Update card:** Settings > Billing, Update card (`U`). Complete a
   setup-mode session. Toast "Card updated". The card row shows the new last4.
5. **Cancel then Resume:** Cancel (`C`) schedules end at period end. Resume
   (`R`) restores renewal. Toasts match the dates shown on the plan row.
6. **Receipt:** open a Receipt link. It loads a Stripe-hosted PDF in a new tab.
7. **Setup-mode webhook:** Stripe Dashboard (or Compass `app:billing.webhook`
   logs) shows a successful `checkout.session.completed` delivery for the
   setup-mode session (`mode: "setup"`), HTTP 200, and no
   `No Compass user for setup checkout session` / `No Stripe customer for
   setup checkout session` warning.

## Content Security Policy

The repo ships no CSP. The hosted Caddyfile lives on the host, not in this
tree. Operators who front the web with a Content-Security-Policy header need
these Stripe origins so embedded Checkout and Update card can load:

| Directive | Origins |
| --- | --- |
| `script-src` | `https://js.stripe.com` `https://*.js.stripe.com` |
| `frame-src` | `https://js.stripe.com` `https://*.js.stripe.com` `https://hooks.stripe.com` `https://checkout.stripe.com` |
| `connect-src` | `https://api.stripe.com` `https://checkout.stripe.com` |
| `img-src` | `https://*.stripe.com` |

If Link is enabled, also add `https://link.com` and `https://*.link.com` to
`frame-src` and `connect-src`.

## Key files

- Trial length: `packages/core/src/constants/billing.constants.ts`
- Status derivation: `packages/backend/src/billing/services/billing.service.ts`
- Checkout and payment-method sessions: `packages/backend/src/billing/services/stripe.service.ts`
- Webhook: `packages/backend/src/billing/services/billing.webhook.service.ts`
- Write guard: `packages/backend/src/billing/billing.guard.ts`
- Web access: `packages/web/src/billing/useAppAccess.ts`
- Read-only look-around: `packages/web/src/billing/billing-preview.store.ts`
- Embedded Checkout port (the only `loadStripe` call): `packages/web/src/billing/embedded-checkout/embedded-checkout.port.tsx`
- Lazy seam: `packages/web/src/billing/embedded-checkout/embedded-checkout.seam.ts`
- Gate checkout store: `packages/web/src/billing/checkout-panel.store.ts`
- Update-card store: `packages/web/src/billing/card-update.store.ts`
- Settings > Billing management: `packages/web/src/billing/PlanSection.tsx`
