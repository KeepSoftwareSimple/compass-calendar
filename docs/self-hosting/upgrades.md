# Upgrades

How to upgrade a self-hosted Compass install: normal image updates and the
one-time sub-calendar v1 cutover.

**Back up first, every time.** See [Back up & restore](./backup-and-restore.md)
— `./compass update` and `./compass rebuild` don't snapshot your data or your
old app version, so a bad upgrade has no automatic rollback otherwise.

## Normal upgrades (published images)

Most upgrades are a pull-and-restart of the published DockerHub images:

```bash
cd ~/compass
./compass update
```

This runs `docker compose pull` then `docker compose up -d` and waits for
the backend health check. It does not touch your data volumes — it only
replaces the running containers with newer images at whatever version
`compass.yaml` points at.

## Upgrades from your own source checkout

If you run [custom code](./customizing.md) — your own fork, or values baked
into the web bundle at build time — update your git checkout and rebuild
locally instead of pulling published images:

```bash
git pull
cd ~/compass
./compass rebuild
```

`./compass rebuild` builds images locally with Docker instead of pulling
them. It requires the build blocks in `compose.yaml` to be uncommented and
the full repo checkout present alongside it — see the [Custom code
guide](./customizing.md). It restarts and health-checks the same way
`update` does.

## Mongo client options

Backend and Sync open their Mongo clients with wire compression (zstd, then
snappy, when that addon is installed), a warm pool (`minPoolSize` 2), and
`maxIdleTimeMS` of 60 seconds. Applying these options is not a data migration
and does not change indexes. A normal upgrade restart picks up the new
handshake.

A Mongo tier change is separate. Restart both the backend and the Sync
process after the tier change so both clients reconnect.

## Database migrations

Current releases do not ship a server-side migration runner or pending
database migrations. Normal upgrades only replace the running images. Back up
before an upgrade as usual; a future data repair will ship with its own
operator runbook rather than silently running during deployment.

## Duplicate local calendars (`calendar_userId_local_unique`)

The backend creates two indexes on the `calendar` collection at startup: one
on `userId` (for listing a user's calendars) and a unique partial index named
`calendar_userId_local_unique` so each user has at most one local calendar.

If your database already has two or more local calendars for the same user,
startup logs a warning, skips that unique index, and keeps running. The
`userId` index is still created. Until you dedupe, the unique guard the
backend assumes for `ensureLocalCalendar` is not in place.

To create the unique index:

1. Back up first ([Back up & restore](./backup-and-restore.md)).
2. Connect `mongosh` using the API URI in `mongo.uri` (self-hosted default
   database: `prod_calendar`). The collection is `calendar`.
3. List users with more than one local calendar:

   ```javascript
   db.calendar.aggregate([
     { $match: { "source.provider": "local" } },
     {
       $group: {
         _id: "$userId",
         count: { $sum: 1 },
         ids: { $push: "$_id" },
       },
     },
     { $match: { count: { $gt: 1 } } },
   ]);
   ```

4. Keep one local calendar per user. Prefer the `_id` that user's events
   already reference (`event.calendarId`). Delete the extra local calendar
   rows.
5. Restart the backend. The unique index is created on the next startup once
   no duplicates remain. Look for `Ensured calendar indexes` in the backend
   log, and confirm the warning about `calendar_userId_local_unique` is gone.

## Upgrading from a pre-cutover install (before v1.0.236)

The sub-calendar v1 release (2026-07) moved events out of the legacy `event`
collection into a calendar-owned schema behind a one-time collection rename.
The migration code for that cutover shipped in releases up to **v1.0.310**
and was removed afterwards, so releases newer than v1.0.310 cannot migrate a
pre-cutover database.

If your install has never performed the cutover, upgrade in two steps:

1. Upgrade to
   [v1.0.310](https://github.com/SwitchbackTech/compass-calendar/tree/v1.0.310)
   and complete the cutover following that version's
   [event migration runbook](https://github.com/SwitchbackTech/compass-calendar/blob/v1.0.310/docs/self-hosting/event-migration-runbook.md).
2. Then upgrade to the latest release as a normal upgrade.

Installs that already cut over (or were first installed after v1.0.236)
upgrade normally and can ignore this section.

## What to read next

[Server hosting guide](./server-guide.md) (initial setup),
[Monitoring](./monitoring.md) (what to watch after an upgrade), and [Google
Calendar](./google-calendar.md) (if the upgrade touches Google sync
configuration).

----

Have an idea on how we can make self-hosting easier? Let us know in [this GitHub Discussion](https://github.com/SwitchbackTech/compass/discussions/1694).
