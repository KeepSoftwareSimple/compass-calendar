# Weekly reflection runbook

Weekly reflection emails are live for every account and opt-in. Existing
accounts join through an explicit opt-in. New signups see a default-on
checkbox they can clear before creating the account; a user receives reviews
only after enrolling that way, from Settings, or via the CLI. See the
[implementation plan](../features/weekly-reflection-plan.md) for the agreed
email behavior.

## How a user opts in

- **Sign-up screen:** the welcome modal's last step has a "weekly reflection
  every Sunday" checkbox, on by default so people know what is coming and can
  opt out before creating an account. The choice survives the OAuth redirect in
  browser storage and is applied once, as soon as the new account is signed in.
  Continuing as a guest enrolls no one.
- **Settings > Notifications:** preview a sample email and its PDF, then select "Weekly reflection emails".
- **Operator CLI:** `bun cli reflection enable --user-id <id> --apply` (below).

Enrolling needs no calendar history; it records consent. A review is only sent
once history is complete and calendar connections are healthy, otherwise that
Sunday's attempt retries until local noon and is then skipped.

Turning reviews on from the sign-up screen or Settings also queues a single
confirmation email, once per account, from the standard sender address. It tells
the user their first review is coming, on which Sunday, and asks them to allow
the sender so the first review lands in the inbox. The CLI does not send it.

The fifth welcome email (day 5) introduces weekly reflections. Its button opens
an opt-in confirmation page that works while signed out. The confirmation email
opens Notifications with the reflection checkbox focused.

Reviews arrive Sunday at 10:30 a.m. in the saved timezone, observing DST. A send
that cannot be attempted by local noon expires rather than replaying later.
Pausing in Settings, the reflection unsubscribe link, a global unsubscribe, or
provider suppression all stop reviews. A paused account is never re-enabled
automatically.

## Configuration

One switch, `email.reflection.enabled` (GitHub Environment variable
`REFLECTION_ENABLED`), default `true`. Set it to `false` to stop all reflection
delivery and hide the Settings control. Calendar sync, welcome emails, and
booking alerts are unaffected. Delivery also needs the email provider and
unsubscribe secret configured as for other Compass emails.

## Enroll or stop one account (operator)

Create a private JSON file outside the checkout, never committed, with the
account email, a real `YYYY-MM-DD` birthday, timezone, and optional
`excludedCalendarIds`:

```json
{
  "recipientEmail": "you@example.com",
  "birthDate": "1990-02-03",
  "timeZone": "America/Denver",
  "excludedCalendarIds": []
}
```

```sh
bun cli reflection setup --input /private/path/reflection-setup.json          # dry run
bun cli reflection setup --input /private/path/reflection-setup.json --apply  # saves settings, delivery off
bun cli reflection status --user-id <user-id>
bun cli reflection preview --user-id <user-id> --weekly --date <sunday>
bun cli reflection enable --user-id <user-id> --apply
bun cli reflection disable --user-id <user-id> --apply   # also cancels queued editions
```

`status` and `history` (without `--apply`) are read-only. `history --apply`
enqueues background import work through Sync; completion is confirmed with
`status`, not by the enqueue succeeding. `preview` writes HTML, text, and, when a
birthday is saved, the Life View PDF to a temporary directory without sending
anything. The real email uses the same PDF as a downloadable attachment.
Every command omitting `--apply` is a dry run.

An opted-in account whose history is incomplete or whose calendar connection
needs attention is not sent a review. Verify a real
received email and PDF in the inbox before treating presentation as validated.

## November 25 rollout review

- **Inbox presentation.** Opened the November 22 production trial review in
  desktop Gmail. The recap, preview, memories, and Life View summary rendered
  in the email. Gmail opened the attached single-page PDF and rendered the
  grid and labels. Mobile presentation remains unverified.
- **Import load and readiness.** The production Sync jobs collection had
  no pending, claimed, or failed repair or initial-import jobs at the time of
  review. The one confirmed subscriber had certified history for all 13
  selected remote calendars. One selected calendar lacked a healthy connection,
  so its connection needs attention before that account can receive a review.
  This snapshot measures current backlog and eligibility. Import load under
  broader adoption remains unmeasured.
- **Queue and delivery.** The reflection queue had no jobs overdue by more
  than ten minutes. Since November 22 it recorded one sent review, matching a
  Resend delivery with zero bounces, failures, or complaints for that message.
  These observations cover a single prelaunch delivery.
- **Consent.** The old population enrollment path left 983 enabled accounts
  with its default UTC settings and no recorded opt-in. Operations disabled
  delivery on those accounts and verified that one explicitly enrolled account
  remained enabled. No other reflection sends appeared in the review window.
- **Usefulness and announcement.** The sample included dated upcoming events
  and memories spanning multiple years. This establishes what the email
  presents. Recipient feedback on accuracy and usefulness is still needed.
  Before expanding prompts, review the November 29 outcomes, including skips,
  failures, complaints, import backlog and recipient feedback.

## Rollback

Set `REFLECTION_ENABLED=false` and redeploy. Persisted preferences remain for a
later restart. To stop one account, use `disable` above.
