# Welcome Email Sequence

An in-house email sequence that welcomes new accounts and teaches them
Compass over their first two weeks. Status: designed, not built. This doc is
the build plan.

The goal of the build is that **the service is finished and proven in staging
while the copy is still placeholder text**. When it is done, the only
remaining work is writing the five emails, which means editing one file.

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
- Content and machinery are separable, so copy can change without touching
  the machinery and the machinery can be verified without final copy.

## Decision summary

| Concern | Decision |
| --- | --- |
| Delivery provider | Resend, behind a two-function port so it can be swapped. Postmark is the runner-up. |
| Where the code runs | Existing backend process. No new service, no Redis, no queue library. |
| Scheduling | One Mongo collection of pending sends, drained by a poller. Same shape as `bookingOperation`: Zod-validated records, `attemptCount` / `nextAttemptAt` / `lastError`, `claimDue` with a lease. |
| Sequence definition | A TypeScript array of steps. Change timing or order by editing code and deploying. |
| Copy | One content file, `welcome-sequence.content.ts`. Plain data. Shipping placeholder copy is what unblocks the build. |
| Templates | One shared layout function. No templating engine. |
| Compliance | Signed one-click unsubscribe link and headers. Provider bounce and complaint webhooks suppress the address. |
| Observability | The collection is the ledger. A heartbeat plus per-send PostHog events mirror it. |
| Staging proof | Resend's test addresses for deterministic delivered/bounced/complained, plus a `fast` schedule profile so a two-week sequence runs in ten minutes. |
| Self-host | Off unless the operator configures the `email:` block. |

## Why not the alternatives

- **A hosted automation tool** costs a monthly tier plus per-subscriber
  growth and duplicates our user table into a second system that has to be
  kept in sync (signups in, deletions and unsubscribes out). Everything it
  gives us beyond delivery is about five steps and a delay.
- **A separate email service or queue** (BullMQ, SQS, a new container) adds
  an operational surface for a workload that is a few hundred sends a day at
  most. The backend already runs periodic Mongo-backed drain loops
  (`publicBookingService.startRecoveryRetries`, `startAccountDeletionRetries`);
  one more is cheaper than a new process.
- **Amazon SES** is the cheapest per email but hands reputation, bounce
  routing (SNS topics), and suppression back to us. That is the exact work we
  want to rent.
- **Twilio SendGrid** works but has no free tier anymore, a heavier API, and
  shared-IP deliverability that lags Postmark and Resend. Nothing about it is
  simpler for this use.

## Provider choice

Any transactional provider with a REST send endpoint and bounce webhooks
fits the port below. **Verify current pricing and the test-address behavior
against the provider's own docs before signing up**; the figures below are
from the time of writing.

| Provider | Price at our volume | Notes |
| --- | --- | --- |
| Resend | Free tier, then about $20/mo for 50,000 | Plain JSON API via fetch, idempotency keys, signed webhooks, one-click unsubscribe support, reserved test addresses that force delivered/bounced/complained. |
| Postmark | About $15/mo for 10,000 | Best deliverability reputation. Separate broadcast stream for non-transactional mail. |
| Amazon SES | $0.10 per 1,000 | Cheapest, most setup, we own reputation. |
| Twilio SendGrid | About $20/mo for 50,000 | No advantage for this workload. |

Recommendation: Resend. Send from a dedicated subdomain
(`mail.compasscalendar.com`) so a reputation problem never touches the app
domain. DNS work is one-time: the DKIM, SPF, and DMARC records the provider
prints.

The test addresses are the reason Resend is worth choosing for this build.
They let staging exercise bounce and complaint handling on demand instead of
waiting for a real bounce, which is otherwise the least testable part of the
system.

## Architecture

Everything lives in `packages/backend/src/email/`.

```
signup (upsertUserFromAuth, isNewUser)
  └─ enroll: insert one emailSend row per step, sendAt = now + step.delay

poller (every 60s, started in app.ts beside the other drain loops)
  └─ claimDue(batch) with a lease on nextAttemptAt
       ├─ step.skipIf(user) true      -> status: skipped
       ├─ user unsubscribed/suppressed -> status: canceled
       ├─ address not on allowlist     -> status: skipped (rollout guard)
       ├─ provider.send ok             -> status: sent, providerMessageId
       └─ provider.send failed         -> attemptCount+1, backoff on
                                          nextAttemptAt, failed after 5

unsubscribe link / provider webhook
  └─ set the user flag, cancel every queued row for that user
```

### Data

One new collection, `emailSend`, registered in `collections.ts` and exposed
on `mongoService`:

```ts
// email-send.record.ts, mirroring booking-operation.record.ts
const EmailSendRecordSchema = z.strictObject({
  _id: z.string(),            // `${userId}:${stepKey}`, also the provider idempotency key
  userId: zObjectId,
  sequence: z.literal("welcome"),
  stepKey: z.string(),
  status: z.enum(["queued", "sent", "skipped", "canceled", "failed"]),
  sendAt: z.date(),
  attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: z.date(),
  lastError: z.string().max(500).nullable(),
  providerMessageId: z.string().nullable(),
  sentAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

Indexes: `{ status: 1, nextAttemptAt: 1 }` for the claim, `{ userId: 1 }` for
cancellation. The `_id` shape makes double enrollment a duplicate-key error
instead of a duplicate email, which the repository swallows the same way
`bookingOperation` does.

There is no separate `sending` status. A claim moves `nextAttemptAt` forward
by the lease, which is what keeps two replicas off the same row, so a row
that crashes mid-send is simply retried after the lease expires and the
provider idempotency key stops the duplicate.

Two new optional fields on `Schema_User`, following the incremental-field
convention already used for `billing`:

```ts
emailPreferences?: {
  unsubscribedAt?: Date; // the user clicked the link
  suppressedAt?: Date;   // the provider reported a hard bounce or complaint
};
```

### Sequence and copy, kept apart

This split is what makes the handoff clean. `welcome-sequence.ts` is
machinery and stops changing once it works. `welcome-sequence.content.ts` is
the only file that changes when the emails get written.

```ts
// welcome-sequence.ts: machinery
export const WELCOME_SEQUENCE: EmailStep[] = [
  { key: "welcome", delayDays: 0 },
  { key: "shortcuts", delayDays: 2 },
  { key: "connect-calendar", delayDays: 5,
    skipIf: (user) => user.hasConnectedCalendar },
  { key: "booking", delayDays: 9 },
  { key: "trial-ending", delayDays: 12,
    skipIf: (user) => user.billing?.subscriptionStatus === "active" },
];

// welcome-sequence.content.ts: the copy, and nothing else
export const WELCOME_CONTENT: Record<StepKey, EmailContent> = {
  welcome: {
    subject: "TODO(copy): welcome subject",
    preheader: "TODO(copy)",
    heading: "TODO(copy)",
    paragraphs: ["TODO(copy): first paragraph."],
    cta: { label: "Open Compass", path: "/day" },
  },
  // ... one entry per step
};
```

`email-layout.ts` turns one `EmailContent` into `{ subject, html, text }`:
single column, inline styles, one call to action, always a text
alternative. Links get `utm_source=email&utm_campaign=welcome&utm_content=<stepKey>`
appended so the existing web PostHog capture attributes visits with no open
tracking and no pixel.

Placeholder copy ships with the machinery and is deliberately obvious. Add
the `TODO(copy)` marker to the lint pass that already enforces the em-dash
ban, so a `TODO(copy)` string cannot reach production once the emails are
real.

Rows are created at signup and `skipIf` runs at send time. That gives both:
the schedule is visible in the database the moment someone signs up, and a
step still adapts to what the user has done since.

### Schedule profiles

A two-week sequence is untestable in a single sitting, so the delay unit is
config:

```yaml
email:
  scheduleProfile: real   # real | fast
```

`real` reads `delayDays` as days. `fast` reads it as minutes, so the whole
five-step sequence completes in about twelve minutes. Staging runs `fast`.
The config refine refuses `fast` when `runtime.nodeEnv` is `production`,
using the existing `isNonProduction` helper, so it cannot be left on by
accident in prod.

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
  verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): EmailWebhookEvent[];
};
```

Two implementations. `resend.provider.ts` is fetch against the REST API with
no SDK. `log.provider.ts` prints the rendered email and returns a synthetic
message id; it is the default in development and tests and in any deployment
without an API key. This mirrors how `stripe.client.ts` wraps Stripe so
services never touch the vendor directly.

### Compliance, which is also deliverability

Gmail and Yahoo bulk-sender rules and CAN-SPAM both require this, and a low
complaint rate is what keeps mail out of spam.

- Every email carries `List-Unsubscribe` (mailto and https) and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers plus a footer
  link.
- `GET /api/email/unsubscribe?token=` renders a small server-side HTML
  confirmation and `POST` performs it. No web route and no React: the whole
  page is one string in the backend controller. The token is an HMAC of the
  user id keyed by `email.unsubscribeSecret`, so no login is needed and
  nothing is stored. `booking-cancel-token.ts` is the nearest precedent; this
  one is an HMAC rather than a stored hash because there is no row to hang a
  hash on and nothing to expire.
- `POST /api/email/webhooks/resend` verifies the signature over the raw body
  and, on `bounced` or `complained`, sets `suppressedAt` and cancels queued
  rows. On `delivered` it stamps the row. The route needs `express.raw()`
  mounted before the JSON parser, exactly as
  `billing.routes.config.ts` does for Stripe, and the same idempotent-webhook
  posture as `billingEvent`.
- Account deletion (`deleteCompassDataForUser`) deletes the user's rows
  inside the existing transaction.
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
  unsubscribeSecret: REPLACE_WITH_RANDOM_32_BYTES # openssl rand -base64 32
  scheduleProfile: real # real | fast (fast refused in production)
  allowlist: [] # rollout guard: when non-empty, only these addresses receive mail
```

Omit the block and nothing is enrolled or sent. `provider: resend` requires
`apiKey`, `from`, `webhookSecret`, and `unsubscribeSecret` together, enforced
in the same `superRefine` as Stripe's all-or-none rule. `allowlist` mirrors
`billing.bypassEmails`, reuses its `toEmailList` helper, and is the staging
and first-production guard. Log the mode and the allowlist count once at
startup beside the billing bypass line, addresses excluded.

`_deploy-environment.yml` writes the block from GitHub Environment values.
Bind the secrets directly rather than through a boolean expression: the
Stripe block carries a comment recording that GitHub blanks secrets used in
boolean expressions, which once left staging-cloud with no config at all.

### Observability

- **The ledger.** `db.emailSend.find({ status: "failed" })` answers what
  broke. `{ status: "queued", nextAttemptAt: { $lt: now } }` answers whether
  the poller is stuck. Every row keeps its last error.
- **Heartbeat.** An `email_send_heartbeat` event every five minutes carrying
  queued depth, oldest queued age, and failures in the last 24 hours, built
  the same way as `booking-lifecycle.heartbeat.ts` and tagged with
  `environment` so staging and production stay separable.
- **Per-send events.** `email_sent`, `email_skipped`, `email_failed`,
  `email_bounced`, `email_complained`, `email_unsubscribed`, keyed by user id
  through the existing `captureSafely` client with `step` as a property. With
  the UTM tags this gives a funnel per step in the same tool as the rest of
  the product analytics.
- **Logs.** One info line per send and one warn per failure through the
  existing winston and OTel path.
- **Provider dashboard.** Delivery, bounce, and complaint rates. Alert if the
  complaint rate passes 0.1 percent.

### Performance and safety

- `claimDue` uses `findOneAndUpdate` with a lease so two backend instances
  never send the same row.
- The row id is the provider idempotency key, so a crash between send and
  status update cannot produce a duplicate.
- Cap each tick at 50 sends and space provider calls to stay under rate
  limits. At current signup volume a tick is usually empty.
- Retry failures with backoff over five attempts, then leave the row `failed`
  for a human. Never retry a 4xx that says the address is invalid; suppress
  instead.
- Self-hosted installs default to no email. Operators who want it bring their
  own provider key.

## Files

New, all under `packages/backend/src/email/`: `email-send.record.ts`,
`email-send.repository.ts`, `email-indexes.ts`, `email.constants.ts`,
`welcome-sequence.ts`, `welcome-sequence.content.ts`, `email-layout.ts`,
`unsubscribe-token.ts`, `email-enroll.service.ts`,
`email-dispatch.service.ts`, `email-suppression.service.ts`,
`email.analytics.ts`, `email.heartbeat.ts`, `email.routes.config.ts`,
`controllers/email.controller.ts`, `controllers/email.webhook.controller.ts`,
`providers/email.port.ts`, `providers/log.provider.ts`,
`providers/resend.provider.ts`.

Edited:

| File | Change |
| --- | --- |
| `packages/core/src/config/compass.config.ts` | real `email` block in place of `z.unknown()` |
| `packages/backend/src/common/constants/config.constants.ts` | `EMAIL_*` keys, all-or-none refine, `fast`-in-production refusal |
| `packages/backend/src/common/constants/collections.ts` | `EMAIL_SEND` |
| `packages/backend/src/common/services/mongo.service.ts` | `emailSend` collection |
| `packages/backend/src/app.ts` | `ensureEmailIndexes`, start and stop the dispatch loop |
| `packages/backend/src/servers/express/express.server.ts` | mount `EmailRoutes`, raw body before JSON on the webhook path |
| `packages/core/src/types/user.types.ts` | `emailPreferences` |
| `packages/backend/src/user/services/user.service.ts` | enroll on `isNewUser`, delete rows on account deletion |
| `packages/scripts/src/cli.ts` | `email-preview` command |
| `packages/scripts/src/testing/lint.ts` | fail on `TODO(copy)` |
| `compass.example.yaml`, `self-host/compass.example.yaml`, `docs/Config/README.md` | document the block |
| `.github/workflows/_deploy-environment.yml` | write the `email:` block |

## Rollout

Four PRs, each shipped through `.agents/skills/ship/SKILL.md`, each safe to
deploy because everything stays inert until the `email:` block exists.

1. **Machinery.** Config block, provider port with both adapters, collection,
   indexes, repository, enrollment on signup, cancellation on account
   deletion, the dispatch loop, the layout, and all five steps with
   placeholder copy. Plus `bun run cli email-preview` writing rendered HTML
   and text to disk so copy can be reviewed without sending anything. Tests:
   enrollment creates the right rows, claim is exclusive, retry and give-up,
   schedule profiles, layout snapshot, `log` provider output. Deployed with no
   `email:` block, so nothing changes in staging and the only new behavior is
   an index.
2. **Compliance.** Unsubscribe route, headers and footer, HMAC token,
   provider webhook with signature verification, suppression, cancellation,
   and the `emailPreferences` fields. Required before any real address is
   mailed.
3. **Observability and deploy wiring.** Heartbeat, PostHog events, the
   `_deploy-environment.yml` block, and the staging verification runbook
   below as `docs/development/email-staging-verification.md`.
4. **Staging enablement.** No code. Set the GitHub Environment values for
   `staging-cloud`, deploy, and work the runbook. The service is done when
   every check passes.

Writing the real copy comes after that and touches
`welcome-sequence.content.ts` alone.

## Human prerequisites

These block phase 4 and only the operator can do them. Per `AGENTS.md` they
are escalation territory (secrets, access grants), so they are called out
rather than assumed.

- [ ] Create the Resend account and an API key.
- [ ] Add the DKIM, SPF, and DMARC records for `mail.compasscalendar.com` and
      wait for verification.
- [ ] Create the Resend webhook pointing at
      `https://<staging-host>/api/email/webhooks/resend` and copy its signing
      secret.
- [ ] Generate `unsubscribeSecret` (`openssl rand -base64 32`).
- [ ] Set `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_SCHEDULE_PROFILE=fast`, and
      `EMAIL_ALLOWLIST` as `staging-cloud` Environment variables, and
      `EMAIL_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET` as
      `staging-cloud` Environment secrets.

## Staging verification

The acceptance list for "the service works". Run it on `staging-cloud` with
`scheduleProfile: fast` and the allowlist set to team addresses. Resend's
reserved test addresses drive the provider outcomes, so no check depends on
waiting for a real bounce. Confirm the current names for those addresses in
the provider's docs before relying on them.

| # | Check | Expected |
| --- | --- | --- |
| 1 | Sign up a fresh staging account | five `queued` rows, `sendAt` spaced by minutes |
| 2 | Wait one poll | step one is `sent` with a `providerMessageId`, and the mail arrives |
| 3 | Inspect the received message | text part present, `List-Unsubscribe` and `List-Unsubscribe-Post` headers present, links carry UTM tags, no `TODO(copy)` left unnoticed |
| 4 | Reset a `sent` row to `queued` by hand | provider dedupes on the idempotency key, no second copy arrives |
| 5 | Point `apiKey` at a bad key, wait | `attemptCount` climbs with backoff, row lands `failed` after five attempts, nothing sent twice |
| 6 | Enroll the provider's bounce test address | webhook sets `suppressedAt`, remaining rows `canceled`, `email_bounced` captured |
| 7 | Enroll the provider's complaint test address | same, via `email_complained` |
| 8 | Click the footer unsubscribe link | confirmation page renders, `unsubscribedAt` set, remaining rows `canceled` |
| 9 | Connect a calendar before step three is due | that row becomes `skipped`, not `sent` |
| 10 | Sign up an address outside the allowlist | row `skipped`, nothing sent |
| 11 | Delete the staging account | rows gone |
| 12 | Redeploy with the `email:` block removed | no enrollment, no poller, startup clean |
| 13 | Check PostHog | `email_send_heartbeat` arriving with `environment=staging`, one `email_sent` per step |

Claim exclusivity under two replicas is covered by a `.db.test.ts` rather
than staging, since staging runs a single backend.

## Production

Left to the operator, after staging is green:

1. Verify the sending domain for production, or reuse the same subdomain.
2. Set the production Environment values with `scheduleProfile: real` and
   `allowlist` holding only the founder's address.
3. Deploy, sign up a real account, confirm one email arrives.
4. Clear `allowlist` to open it to all new signups.

Only new signups enroll; existing users are not backfilled. A one-off CLI
command can enroll a chosen cohort later if that is wanted.

## Non-goals

- A visual editor, A/B testing, segments, or an admin UI. The array, the
  content file, and the database are the UI.
- Open tracking.
- Time-of-day optimization. The user record has no timezone; signup time plus
  a whole number of days is fine.
- Sending from Compass Sync. Email is a backend concern about accounts.
- Replacing SuperTokens' password reset delivery in this work.
