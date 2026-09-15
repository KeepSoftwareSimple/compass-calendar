import { z } from "zod/v4";
import { SyncEventCalendarIdSchema } from "@core/types/sync/event.contracts";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";
import { ObjectIdStringSchema } from "@core/types/type.utils";

// A connection's calendar list, or one calendar's event collection — each an
// independently synchronized unit of work.
export const ResourceKindSchema = z.enum(["calendarList", "events"]);
export type ResourceKind = z.infer<typeof ResourceKindSchema>;

// A newly discovered calendar does not become ready merely because its first
// import produced a cursor. It must also establish its watch (or prove watch is
// unsupported) and complete one incremental pull after that boundary.
export const ResourceBootstrapStateSchema = z.enum([
  "importing",
  "watching",
  "catchingUp",
  "ready",
]);
export type ResourceBootstrapState = z.infer<
  typeof ResourceBootstrapStateSchema
>;

// Persistence record for `sync_resources` — one independently synchronized
// provider resource with its cursors, import generation, timing, and push
// subscription. A calendar-list resource has no calendarId (there is one per
// connection); an events resource is keyed to one provider calendar. Holds no
// event content.
export const SyncResourceRecordSchema = z.strictObject({
  _id: ObjectIdStringSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  connectionId: ConnectionIdSchema,
  resourceKind: ResourceKindSchema,
  calendarId: SyncEventCalendarIdSchema.nullable(),
  // Opaque provider incremental cursor. Advances only after every page in a
  // batch has committed.
  syncCursor: z.string().min(1).nullable(),
  // Mid-batch page checkpoint for resumable pulls; null between batches.
  pageCursor: z.string().min(1).nullable(),
  // A repair's STAGING generation. Only a non-destructive repair touches this:
  // it bumps this ahead of activeGeneration to build a fresh generation
  // alongside the queryable one, then sets activeGeneration to it on success.
  // Equal to activeGeneration in steady state. Steady-state writers (import and
  // pull) do NOT write into this — they write the active generation, so a repair
  // left incomplete (this bumped ahead, never activated) never strands their
  // writes in a generation reads ignore.
  importGeneration: z.number().int().min(0),
  // The generation reads SERVE and steady-state writers (import, pull) write
  // into — the single live generation outside a repair. A repair holds this back
  // at the old generation while it builds importGeneration, then activates the
  // new one atomically, so reads never see a half-built repair. Defaults to 0 so
  // a resource written before this field existed reads as its single generation.
  activeGeneration: z.number().int().min(0).default(0),
  lastAttemptAt: z.date().nullable(),
  lastSuccessAt: z.date().nullable(),
  // calendarList only: when a pass last applied a COMPLETE enumeration — a full
  // list that returned at least one calendar, persisted end to end. This is the
  // staleness clock the rediscovery sweep selects on.
  //
  // Deliberately NOT lastSuccessAt, which advanceCursor stamps on every pass,
  // incremental ones included. The web client refreshes on each page load and
  // each alt-tab-back after 30s, and every one of those enqueues an incremental
  // calendarList pass — so an active user's lastSuccessAt never aged past the
  // sweep's 24h threshold, they never became eligible, and the full pass that
  // retires hidden/removed calendars never ran for them. Using the app disabled
  // its own repair: the 64 connections that self-healed after #2876 were the
  // IDLE ones (2026-08-27).
  //
  // Null (or absent — Mongo's null predicate matches missing) means "never
  // fully listed", which sorts as maximally stale. That is what makes this
  // field self-backfilling: every pre-existing row is eligible on deploy.
  // Defaults tolerate rows written before the field — REQUIRED, see
  // watchUnsupportedAt below.
  lastFullListAt: z.date().nullable().default(null),
  // Set when the provider durably rejects reads for this resource (a
  // non-transient 4xx retries cannot fix — see the readFailed settlement for
  // events resources and the discoveryFailed settlement for calendarList in
  // sync-job-dispatch). Cleared by the next successful pass (advanceCursor),
  // including when that pass advances with a null cursor.
  // Connection health surfaces a non-null marker on an active events calendar
  // or on the connection's calendarList resource as delayed/providerErrors.
  // Defaults tolerate rows written before the field.
  lastReadFailureAt: z.date().nullable().default(null),
  // The redacted failure detail (HTTP status + provider reason) for triage.
  lastReadFailureDetail: z.string().min(1).nullable().default(null),
  // Fresh resources progress importing -> watching -> catchingUp -> ready.
  // Always explicit on every row (backfill-bootstrap-state stamped every row
  // that predated the field) - no default here, so a row silently missing it
  // fails to parse instead of quietly defaulting.
  bootstrapState: ResourceBootstrapStateSchema,
  // Set when the provider terminally refused to open a push channel for this
  // calendar (watch unsupported/durably rejected — see maintainSubscription's
  // "unsupported" outcome). While set, the incremental-pull path stops
  // re-attempting a watch on every cycle; the daily calendar-list full pass
  // clears it so a provider-side change is eventually retried. A successful
  // watch also clears it. Defaults tolerate rows written before the field —
  // REQUIRED for any new field here: enqueue/sweeps re-parse whatever row
  // exists, and a required field froze the fleet for 23h (2026-07-31).
  watchUnsupportedAt: z.date().nullable().default(null),
  // Push subscription: the provider channel id, its opaque resource id, the
  // per-channel secret the provider echoes back on callbacks, and when it
  // expires. All null when no subscription is active.
  subscriptionId: z.string().min(1).nullable(),
  subscriptionResourceId: z.string().min(1).nullable(),
  subscriptionToken: z.string().min(1).nullable(),
  subscriptionExpiresAt: z.date().nullable(),
  // When the provider last told us this calendar changed, and we have not yet
  // completed a pull that observed it. Set on every accepted push notification,
  // cleared by the pull that serves it — but ONLY if it still holds the value
  // that pull started with. A notification landing mid-pull therefore fails
  // that compare-and-clear, which is exactly how the pull learns it read too
  // early and must go round again.
  //
  // Without this, such a notification was lost outright: the job enqueue
  // coalesces on `incrementalPull:<resourceId>`, and $setOnInsert no-ops
  // against the CLAIMED row of the pull already running, so the change waited
  // for the reconcile sweep (15min stale threshold on a ~10min cycle) instead
  // of the ~30s the push path promises.
  //
  // Doubles as the push-latency clock: notified-at to pull-applied is the
  // end-to-end number, previously unmeasurable.
  // Defaults tolerate rows written before the field — REQUIRED, see
  // watchUnsupportedAt above.
  changeNotifiedAt: z.date().nullable().default(null),
  // When a push notification was last ACCEPTED for this resource. Set beside
  // changeNotifiedAt and never cleared, which is the whole point: the marker
  // above is a PENDING flag that the serving pull clears within seconds, so on
  // a healthy fleet it reads null almost always and cannot answer "is push
  // delivery working?". Confusing the two produced a fleet gauge that was
  // ~100% "never notified" whether push was healthy or completely dead
  // (2026-08-23). This field is the durable evidence.
  // Defaults tolerate rows written before the field — REQUIRED, see
  // watchUnsupportedAt above.
  pushLastReceivedAt: z.date().nullable().default(null),
  // How many incremental pulls in a row the provider has rejected with an
  // expired cursor, and until when this resource is held off because of it.
  //
  // Some provider calendars never sustain an incremental cursor: Google's
  // derived holiday calendars (en.usa#holiday@...) 410 a freshly issued
  // nextSyncToken within a minute, so pull -> repair -> pull re-ran forever.
  // Each lap did a full authoritative rebuild, so the DATA stayed correct — the
  // cost was the loop itself: one prod resource reached activeGeneration 1919
  // in four weeks and the churn crowded the drain lanes real calendars share
  // (2026-08-23). The streak drives a widening hold-off so a chronically
  // uncursorable calendar settles at a slow poll instead of a hot loop; a pull
  // that finally applies clears both.
  // Defaults tolerate rows written before the field — REQUIRED, see
  // watchUnsupportedAt above.
  cursorExpiredStreak: z.number().int().nonnegative().default(0),
  cursorExpiredBackoffUntil: z.date().nullable().default(null),
  // Mirrored from provider_calendars.active so stale-resource finders can
  // skip inactive calendars at selection time instead of enqueueing a pull
  // that dispatch then drops. Discovery stamps this when a calendar is
  // (de)activated; startup backfills rows written before the field. Defaults
  // tolerate those rows — REQUIRED, see watchUnsupportedAt above. A missing
  // field still matches the finders' `$ne: false` predicate (treated as
  // active) until backfill or the next discovery pass stamps it.
  calendarActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SyncResourceRecord = z.infer<typeof SyncResourceRecordSchema>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. That broke GET /connections and the sync
// job worker during the #2908 `lastFullListAt` deploy (2026-08-27). The
// mirror-image mistake (a required field with no default) froze the fleet
// for 23h (2026-07-31). Unknown keys are dropped from the in-memory record
// and left untouched in Mongo — writes are field-level `$set`, so the newer
// build's field survives. Writes stay strict, so this build still cannot
// persist an unknown or misspelled key.
export const SyncResourceReadSchema = SyncResourceRecordSchema.strip();

export const SyncResourceUpsertSchema = SyncResourceRecordSchema.pick({
  tenantId: true,
  principalId: true,
  connectionId: true,
  resourceKind: true,
  calendarId: true,
});
export type SyncResourceUpsert = z.infer<typeof SyncResourceUpsertSchema>;
