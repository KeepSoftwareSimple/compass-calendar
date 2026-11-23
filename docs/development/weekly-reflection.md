# Weekly reflection runbook

Weekly reflection emails are live for every account and strictly opt-in. Nobody
is enrolled automatically: not new signups, not existing accounts. A user
receives reviews only after choosing them. See the
[implementation plan](../features/weekly-reflection-plan.md) for the agreed
email behavior.

## How a user opts in

- **Settings > Notifications:** the "Email me calendar reflections" checkbox.
  Enabling it requires complete calendar history and a usable calendar
  connection, otherwise the save is refused with a "still being prepared" message.
- **Operator CLI:** `bun cli reflection enable --user-id <id> --apply` (below).

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

Reviews need complete history. An opted-in account whose history is incomplete
or whose calendar connection needs attention is not sent a review. Verify a real
received email and PDF in the inbox before treating presentation as validated.

## Rollback

Set `REFLECTION_ENABLED=false` and redeploy. Persisted preferences remain for a
later restart. To stop one account, use `disable` above.
