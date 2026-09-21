# Undo of recurring-series writes (v1)

Mod+Z after a scope `all` or `thisAndFollowing` edit or delete currently
records an `unrecorded` marker and toasts `Can't undo the last change`
([#3891](https://github.com/KeepSoftwareSimple/compass-calendar/issues/3891)).
This note decides whether v1 should go further. It does not.

The client has no snapshot of the series as the server stores it (master plus
exceptions). `event.mutation-history.ts` refuses these scopes for that reason:
the server rewrites or splits the series, then `discardSeries` throws away
narrow this-event entries for that series.

## Scope `all` edit

Candidate inverse: a second scope-`all` replace of the series master back to
its cached before snapshot, with `restore: true`.

`executeProviderSeriesUpdate` / `updateCloudSeries` discard per-instance
content and time overrides on every scope-`all` edit and keep only cancelled
tombstones (`partitionEditAllExceptions`). The original write already dropped
those overrides. Replaying the master's before snapshot restores title,
schedule, and rules on the master; it cannot resurrect overrides the first
write deleted, because they were never in the client's history entry.

A naive inverse therefore looks like "the series is back" while silently
leaving per-occurrence edits gone. That is not a safe undo.

## Scope `all` delete

Candidate inverse: recreate the master under its original id with
`restore: true`, the same path as a single-event delete undo.

`deleteCloudSeries` removes every exception, then the master. Recreating from
the client's master snapshot brings the series back without those exceptions.
Cancelled occurrences would project as live again. That is not a safe undo
unless the server also snapshots the exception set at delete time.

## Scope `thisAndFollowing` edit or delete

These split the series: the original master is truncated, a remainder series
is created with a new provider identity, and exceptions at or after the split
move. Re-joining is not a client-side inverse of one occurrence snapshot.

Two server-side options:

1. An explicit inverse command that deletes the remainder, restores the
   original rules, and moves exceptions back. Identity of the remainder series
   is provider-owned; a later sync can race the re-join.
2. A short-lived server snapshot of master plus exceptions plus remainder,
   keyed by the write, restored on undo. This is a new persistence model, with
   a TTL and a rule for what happens once the next pull lands.

Both are larger than v1. The visible refusal from #3891 already tells the
user the split is not reversible from the keyboard.

## v1 choice

Keep the #3891 marker for every series-wide write. Do not add a client-side
inverse for `all` or `thisAndFollowing`.

Limits that stay in v1:

- Undo reaches only history entries with a client-computable inverse
  (this-event edit/delete/create, hide/show, calendar visibility, this-event
  RSVP).
- A series-wide write consumes one Mod+Z as `Can't undo the last change`,
  then the older entry is reachable.
- Once the next sync pull lands, even a later v2 snapshot would be stale
  against provider state Compass did not author.

A later milestone that wants real series undo should start with a server
snapshot of master plus exceptions at the write, not with a client replay of
the occurrence the user had focused. File that only after a product decision
on reach (how long the snapshot lives, and whether cancelled occurrences
return).
