# Welcome Email Sequence

Plan for a small, in-house email sequence that welcomes new accounts and
teaches them Compass over their first two weeks. Status: proposal, not built.

## Goal and constraints

- Send a short drip of educational emails to each new signup.
- No marketing-automation subscription (Kit, ConvertKit, Mailchimp) and no
  per-subscriber pricing.
- Rent only the hard, undifferentiated part: delivery, DKIM/SPF/DMARC,
  IP reputation, bounce and complaint feedback.
- Own the tiny part that is product-specific: when to send, what to send,
  who to stop sending to.
- Simple enough that one engineer can read the whole thing in an afternoon.
  Observable through the tools already in use (Mongo, PostHog, logs).

## Decision summary

| Concern | Decision |
| --- | --- |
| Delivery provider | Resend, behind a three-function port so it can be swapped. Postmark is the runner-up. |
| Where the code runs | Existing backend process. No new service, no Redis, no queue library. |
| Scheduling | One Mongo collection of pending sends, drained by a one-minute poller. Same shape as the pending-account-deletion retry loop already in `user.service.ts`. |
| Sequence definition | A TypeScript array of steps. Change copy or timing by editing code and deploying. |
| Templates | Plain TypeScript functions returning subject, html, and text. No templating engine. |
| Compliance | Signed one-click unsubscribe link and headers. Provider bounce and complaint webhooks suppress the address. |
| Observability | The collection is the ledger. Server-side PostHog events mirror every state change. |
| Self-host | Off unless the operator configures the `email:` block. |

## Why not the alternatives

- **A hosted automation tool** costs a monthly tier plus per-subscriber
  growth and duplicates our user table into a second system that has to be
  kept in sync (signups in, deletions and unsubscribes out). Everything it
  gives us beyond delivery is about five steps and a delay.
- **A separate email service or queue** (BullMQ, SQS, a new container) adds
  an operational surface for a workload that is a few hundred sends a day at
  most. The backend already runs periodic Mongo-backed loops; one more is
  cheaper than a new process.
- **Amazon SES** is the cheapest per email but hands reputation, bounce
  routing (SNS topics), and suppression back to us. That is the exact work we
  want to rent.
- **Twilio SendGrid** works but has no free tier anymore, a heavier API, and
  shared-IP deliverability that lags Postmark and Resend. Nothing about it is
  simpler for this use.

## Provider choice

Any transactional provider with a REST send endpoint and bounce webhooks
fits the port below. Verify current prices before signing up; these are the
published tiers at the time of writing.

| Provider | Price at our volume | Notes |
| --- | --- | --- |
| Resend | Free to 3,000/mo (100/day), then about $20/mo for 50,000 | Plain JSON API via fetch, idempotency keys, Svix-signed webhooks, one-click unsubscribe support. |
| Postmark | About $15/mo for 10,000 | Best deliverability reputation. Separate "broadcast" stream for non-transactional mail. |
| Amazon SES | $0.10 per 1,000 | Cheapest, most setup, we own reputation. |
| Twilio SendGrid | About $20/mo for 50,000 | No advantage for this workload. |

Recommendation: start on Resend's free tier. Send from a dedicated subdomain
(`mail.compasscalendar.com`) so a reputation problem never touches the app
domain. DNS work is one-time: DKIM, SPF, DMARC records the provider prints.

## Architecture

Everything lives in `packages/backend/src/email/`.

```
signup (upsertUserFromAuth, isNewUser)
  └─ enroll: insert one emailSend row per step, sendAt = now + step.delay

poller (every 60s, started in app.ts next to startAccountDeletionRetries)
  └─ claim due rows one at a time with findOneAndUpdate
       ├─ step.skipIf(user) true  -> status: skipped
       ├─ user suppressed/opted out -> status: canceled
       ├─ provider.send ok       -> status: sent, providerMessageId
       └─ provider.send failed   -> attempts+1, next sendAt with backoff,
                                    status: failed after 5 attempts

unsubscribe link / provider webhook
  └─ set user flag, cancel every queued row for that user
```

### Data

One new collection, `emailSend`, registered in `collections.ts`:

```ts
type EmailSendRecord = {
  _id: string; // `${userId}:${stepKey}`, doubles as the provider idempotency key
  userId: ObjectId;
  sequence: "welcome";
  stepKey: string;
  sendAt: Date;
  status: "queued" | "sending" | "sent" | "skipped" | "canceled" | "failed";
  attempts: number;
  claimedAt?: Date;
  sentAt?: Date;
  providerMessageId?: string;
  lastError?: string;
};
```

Index `{ status: 1, sendAt: 1 }` for the poller and `{ userId: 1 }` for
cancellation. The `_id` shape makes double enrollment a duplicate-key error
instead of a duplicate email.

Two new optional fields on `Schema_User`, following the incremental-field
convention already used for `billing`:

```ts
emailPreferences?: {
  unsubscribedAt?: Date; // user clicked the link
  suppressedAt?: Date;   // provider reported a hard bounce or complaint
};
```

### Sequence definition

```ts
export const WELCOME_SEQUENCE: EmailStep[] = [
  { key: "welcome", delay: 0, render: welcomeEmail },
  { key: "shortcuts", delay: days(2), render: shortcutsEmail },
  { key: "connect-calendar", delay: days(5), render: connectCalendarEmail,
    skipIf: (user) => user.hasConnectedCalendar },
  { key: "booking", delay: days(9), render: bookingEmail },
  { key: "trial-ending", delay: days(12), render: trialEndingEmail,
    skipIf: (user) => user.billing?.subscriptionStatus === "active" },
];
```

Rows are created at signup, and `skipIf` runs at send time. That gives us
both: the schedule is visible in the database the moment someone signs up,
and a step still adapts to what the user has done since. Adding, removing,
or retiming a step is an edit to this array. Existing rows keep their
original schedule, which is the right behavior for people mid-sequence.

### Templates

One file per email under `email/templates/`, exporting a function from a
small view model (first name, links) to `{ subject, html, text }`. Single
column, inline styles, one call to action, always a text alternative. Links
carry `utm_source=email&utm_campaign=welcome&utm_content=<stepKey>` so the
existing web PostHog capture attributes visits without any open tracking.
No tracking pixel: it hurts deliverability and tells us little.

User-facing copy follows the repo rule: no em-dashes.

### Provider port

```ts
type EmailProvider = {
  send(input: {
    idempotencyKey: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers: Record<string, string>;
  }): Promise<{ messageId: string }>;
  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookEvent[];
};
```

Two implementations: `resend.provider.ts` (fetch against the REST API, no
SDK) and `log.provider.ts` (prints the email, used in tests, local dev, and
any deployment without an API key). Mirrors how `stripe.client.ts` wraps
Stripe so services never touch the vendor directly.

### Compliance, which is also deliverability

Gmail and Yahoo bulk-sender rules and CAN-SPAM both require this, and a
low complaint rate is what keeps mail out of spam.

- Every email carries `List-Unsubscribe` (mailto and https) and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers plus a footer
  link.
- `GET /api/email/unsubscribe?token=` shows a one-line confirmation page and
  `POST` performs it. The token is an HMAC of the user id signed with
  `email.unsubscribeSecret`, so no login is needed. It sets
  `emailPreferences.unsubscribedAt` and cancels queued rows.
- `POST /api/email/webhooks/<provider>` verifies the signature and, on
  `bounced` or `complained`, sets `suppressedAt` and cancels queued rows. On
  `delivered` it stamps the row. Same idempotent-webhook pattern as
  `billingEvent`.
- Account deletion (`deleteCompassDataForUser`) deletes the user's rows.
- Password reset stays with SuperTokens' built-in delivery. Moving it onto
  the same provider is a small follow-up, not part of this work.

### Configuration

The schema already accepts and ignores an `email:` block. Repurpose it:

```yaml
email:
  provider: resend # resend | log
  apiKey: REPLACE_WITH_RESEND_API_KEY
  from: Compass <hello@mail.compasscalendar.com>
  webhookSecret: REPLACE_WITH_RESEND_WEBHOOK_SECRET
  unsubscribeSecret: REPLACE_WITH_RANDOM_32_BYTES
  allowlist: [] # rollout guard: when non-empty, only these addresses receive mail
```

Omit the block and nothing is enrolled or sent. Setting `provider: resend`
requires the other keys, enforced in the same `superRefine` as Stripe's
all-or-none rule. `allowlist` mirrors `billing.bypassEmails` and is the
staging and first-production guard. Log the mode once at startup, next to
the billing bypass line.

### Observability

- **The ledger:** `db.emailSend.find({ status: "failed" })` answers "what
  broke"; `{ status: "queued", sendAt: { $lt: now } }` answers "is the poller
  stuck". Every row keeps its last error.
- **PostHog:** server-side `email_sent`, `email_skipped`, `email_failed`,
  `email_bounced`, `email_complained`, `email_unsubscribed`, keyed by user
  id through the existing `captureSafely` client, with `step` as a property.
  Combined with the UTM tags this gives a funnel per step in the same tool
  as the rest of the product analytics.
- **Logs:** one info line per send and one warn per failure through the
  existing winston and OTel path. A poller cycle that throws logs an error
  and the next tick retries.
- **Provider dashboard:** delivery, bounce, and complaint rates. Alert if
  the complaint rate passes 0.1 percent.

### Performance and safety

- Claim with `findOneAndUpdate` on `status: queued` so two backend instances
  never send the same row. Rows stuck in `sending` for more than ten
  minutes are reclaimed.
- The row id is the provider idempotency key, so a crash between send and
  status update cannot produce a duplicate.
- Cap each tick at 50 sends and space calls to stay under provider rate
  limits. At current signup volume a tick is usually empty.
- Retry failures with backoff over five attempts, then leave the row as
  `failed` for a human. Never retry a `4xx` that says the address is invalid;
  suppress instead.
- Self-hosted installs default to no email. Operators who want it bring
  their own provider key.

## Rollout

Each phase is one PR shipped through the normal `ship` procedure.

1. **Foundation.** Config block, provider port with `log` and `resend`
   adapters, collection and indexes, enrollment on signup, cancellation on
   account deletion, the poller, and the first email. Tests: enrollment
   creates the right rows, claim is exclusive, retry and give-up, `log`
   provider output. Deploy with `allowlist` set to team addresses.
2. **Compliance.** Unsubscribe route and headers, provider webhook with
   signature verification, suppression, and the `emailPreferences` fields.
   Required before the allowlist comes off. DNS records for the sending
   subdomain happen here.
3. **Content and analytics.** The remaining steps, their `skipIf`
   predicates, PostHog events, and UTM links. Review copy in the `log`
   provider output and in a real inbox on staging.
4. **Open it up.** Clear `allowlist` in production. Only new signups enroll;
   existing users are not backfilled. A later one-off CLI command under
   `packages/scripts` can enroll a chosen cohort if we want that.
5. **Adapt.** Read the per-step PostHog funnel after two weeks and edit the
   array. Reordering or retiming needs no migration.

## Non-goals

- A visual editor, A/B testing, segments, or an admin UI. The array and the
  database are the UI.
- Open tracking.
- Time-of-day optimization. The user record has no timezone; sending at
  signup time plus a whole number of days is fine.
- Sending from Compass Sync. Email is a backend concern about accounts.
- Replacing SuperTokens' password reset delivery in this work.

## Files to touch

- `packages/core/src/config/compass.config.ts`: `email` block schema.
- `packages/backend/src/common/constants/config.constants.ts`: `EMAIL_*`
  keys and the all-or-none refine.
- `packages/backend/src/common/constants/collections.ts`: `EMAIL_SEND`.
- `packages/backend/src/email/`: record type, indexes, providers, sequence,
  templates, enroll service, dispatch service, routes, analytics.
- `packages/backend/src/user/services/user.service.ts`: enroll on
  `isNewUser`, delete rows in `deleteCompassDataForUser`.
- `packages/backend/src/app.ts`: start and stop the poller.
- `packages/core/src/types/user.types.ts`: `emailPreferences`.
- `compass.example.yaml`, `self-host/compass.example.yaml`,
  `docs/Config/README.md`: document the block.
