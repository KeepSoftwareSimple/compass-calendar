# Weekly reflection runbook

Weekly reflection emails are live for every account and opt-in. Existing
accounts are never enrolled automatically. New signups see a default-on
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
- **Settings > Notifications:** the "Email me calendar reflections" checkbox.
- **Operator CLI:** `bun cli reflection enable --user-id <id> --apply` (below).

Enrolling needs no calendar history; it records consent. A review is only sent
once history is complete and calendar connections are healthy, otherwise that
Sunday's attempt retries until local noon and is then skipped.

Turning reviews on from the sign-up screen or Settings also queues a single
confirmation email, once per account, from the standard sender address. It tells
the user their first review is coming, on which Sunday, and asks them to allow
the sender so the first review lands in the inbox. The CLI does not send it.

The fifth welcome email (day 5) is a pitch for weekly reflections sent to every
account, whether or not they enrolled. Its button, and the confirmation email's,
open `/?settings=notifications&focus=weekly-reflection`: Settings on
Notifications with the reflection checkbox focused, so Space or a click is the
whole action. The `focus` param is consumed like `settings`; add new targets to
`settings.search.ts`.

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
`status`, not by the enqueue succeeding. `preview` writes HTML, text, and the Life
View PDF to a temporary directory without sending anything. Every command omitting
`--apply` is a dry run.

An opted-in account whose history is incomplete or whose calendar connection
needs attention is not sent a review. Verify a real
received email and PDF in the inbox before treating presentation as validated.

## Rollback

Set `REFLECTION_ENABLED=false` and redeploy. Persisted preferences remain for a
later restart. To stop one account, use `disable` above.
