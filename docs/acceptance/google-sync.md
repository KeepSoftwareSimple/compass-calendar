# Google Calendar Sync

This runbook covers the Google Calendar sync UX in Compass.

## Principles

The goal of sync, auth, and session UX is to keep users focused on creating,
editing, and deleting events. Status UI exists only to support that goal. Every
sync/auth surface should answer one of three questions honestly:

1. **Can Compass handle this without the user?** Prefer silent background
   recovery so the user never has to think about sync.
2. **Is Compass still working on it, with no user action needed?** Tell the
   user their data will catch up soon, calmly and consistently.
3. **Does Compass need the user right now?** Make that unmistakable, give a
   direct path to help, and do it before the user wastes time on work that
   cannot be saved.

### Prefer silent background recovery

If Compass can recover without help — token refresh, watch repair, incremental
catch-up, focus refresh, or similar — it should. Do not ask the user to act,
and do not elevate a recoverable situation into an error toast or
reconnect CTA.

### Progress when help is not needed yet

When work is in progress and will likely finish on its own, say so clearly
(for example “Adding your calendar…” or “Syncing in the background…”). The
user should understand that data will catch up soon and that no action is
required. This mode must never be used once Compass already knows recovery
needs the user.

### Action-required must be unmistakable and early

When Compass cannot reliably recover without the user — especially Google
OAuth reconnect after access expires or is revoked — every relevant surface
must say so as soon as that terminal state is known, and must offer a direct
path to help (Reconnect).

Do not wait for a failed create/edit/delete (for example HTTP `410` with
`GOOGLE_REVOKED`) to reveal the problem. Prefer steering the user toward
reconnect before they invest time writing an event that will not save.

The one exception is the billing gate. While `BillingGateModal` owns the
screen (signed-in, read-only, not looking around, not celebrating checkout),
do not show the reconnect or delayed-sync toast: Start trial is the only
primary action. After "Look around first", or on a refused write, show the
toast as usual. Sidebar and Settings status may still say reconnect is
required during the gate; only the toast waits so it cannot compete with
the conversion surface.

### One story across the UI

Toast, sidebar status, Settings / Accounts status, and any other sync or auth
indicators must tell the same story at the same time.

- If reconnect is required, no surface may claim the calendar is connected,
  healthy, “all clear,” or merely syncing in the background.
- If background recovery succeeds, every surface that previously asked for
  help must update or dismiss — no stale reconnect toast after the connection
  is healthy again.
- Contradictory states (toast says disconnected, Settings says connected,
  sidebar says syncing) are acceptance failures, even if events eventually
  reappear.

### Durable truth over optimistic flicker

A known terminal reconnect-required failure must not be overridden by
transient healthy, importing, or catching-up signals. Brief verification
progress is allowed, but the UI must not bounce the user through states that
imply the problem resolved when it did not. False recovery followed by a
later write failure and disappearing events is worse than staying clearly in
action-required.

## Scope

Use this guide to validate:

- connecting Google Calendar from a password session
- the initial import — progress indicator and completion
- real-time sync: event created in Google appears in Compass
- real-time sync: event created in Compass appears in Google
- Google Calendar status displaying as HEALTHY
- sync needing attention and user triggering a refresh
- automatic silent refresh on app focus / long tab hide
- Google access revoked — reconnect-required UX shown early and congruently
- re-connecting Google after revocation
- per-calendar visibility hide/show and its server-side read filtering
- Google-side calendar add/rename/recolor/uncheck/remove/delete reconciling
  into Compass
- watch repair self-healing after an expired/deleted watch
- freeBusyReader calendars showing availability without event details
- revoked access keeping last-known events read-only while other accounts stay usable
- status surfaces staying congruent through recovery and action-required paths

Do not use this guide to validate:

- first-time Google sign-in from a logged-out state (see `docs/acceptance/auth.md`, Scenario 5)
- connecting Google during initial signup (see `docs/acceptance/auth.md`, Scenario 7)
- calendar-target selection and read-only event interaction (see `events.md`,
  "Calendar-Aware Events")

## Setup

1. Start the app with `bun run dev:web`.
2. Start the backend — Google sync requires a live backend with Google credentials configured.
3. Ensure `compass.yaml` at the repo root has valid Google OAuth client credentials.
4. Use a Google account you control and can create test events in.
5. For revocation scenarios, you need access to the Google account's security settings at `myaccount.google.com/permissions`.
6. Scenarios 9-13 are easiest with three calendars on the connected account:
   one you own (writable), one shared with you as a reader, and one shared
   with you as `freeBusyReader` ("See only free/busy"). Scenarios 10-12 need
   only the specific calendar role each one calls out.

Helpful notes:

- Users can disconnect a Google account from Settings → Accounts. Access can
  also become unusable when the user removes Compass in Google's account
  settings (`myaccount.google.com/permissions`) or when Google reports
  expired/revoked credentials.
- All eligible Google calendars import by default — there's no UI to opt a
  calendar out of import, and unchecking a calendar in Google does not opt it
  out either (Scenario 10). The sidebar's "Calendars" list controls
  per-calendar *visibility* in Compass instead (Scenario 9); a calendar hidden
  there keeps syncing in the background, it just stops showing events.
- Google status lives under the account email as a live status line (plus an
  optional “Updated …” timestamp when healthy). Action CTAs are separate
  buttons, not email tooltips.
- The email shimmer animation appears during import and local saves. There is no granular progress bar.
- Manual refresh failures toast; automatic focus refresh is silent on failure.
- Successful sync operations do not toast.
- Reconnect-required messaging is sticky until the requirement clears or the
  user starts reconnect. When the requirement clears, every surface that
  showed it must update together.

---

## Scenario 1: Connect Google Calendar From A Password Session

### UX

A password-authenticated user can connect Google Calendar from the sidebar. Existing Compass data must remain intact after connecting.

### Steps

1. Sign up or log in with email/password. Do not connect Google.
2. Create at least one Compass event so there is pre-existing data.
3. In the sidebar, select Connect Google Calendar.
4. Complete the Google authorization redirect with the intended Google account.
5. Return to Compass and observe the sidebar account email.
6. Reload the page.

### Expected Results

- The Google authorization redirect returns to Compass through `/auth/google/callback`.
- The sidebar shows “Adding your calendar…” with the syncing shimmer. It remains visible until the complete import is healthy, even as individual Google events appear.
- Pre-existing Compass events remain visible on the calendar.
- The browser navigates to a Sync-owned Google OAuth URL from
  `AuthApi.beginGoogleConnection` (not the logged-out Google sign-in path).
- After reload, the Google connection state persists.

---

## Scenario 2: Initial Import — Progress And Completion

### UX

After connecting Google, Compass imports all events from the user's Google calendars. The sidebar account email shows a wave shimmer while the import runs. The app remains interactive during import.

### Steps

1. Connect Google Calendar (see Scenario 1), or start with an account that has `importGCal` flagged for restart.
2. Observe the sidebar account email immediately after the Google authorization redirect returns.
3. Hover the email to read the tooltip.
4. Continue using the app normally while the import runs (navigate to different dates, create a Compass event).
5. Wait for the shimmer to stop.
6. Check the calendar for newly imported Google events.

### Expected Results

- The sidebar status line shows “Adding your calendar…” with the email shimmer.
- The app remains fully interactive during import (no blocking overlay).
- Google events gradually appear on the calendar as import progresses.
- When import completes, the shimmer stops and the status line becomes
  “Calendar connected” (optionally with an “Updated …” timestamp).
- No success toast is shown — completion is indicated only by the status
  settling and events appearing.

---

## Scenario 3: Real-Time Sync — Event Created In Google Appears In Compass

### UX

After Google is connected and import is complete, creating an event in Google Calendar should appear in Compass within a few seconds without a page reload.

### Steps

1. Confirm Google Calendar is connected and the sidebar shows HEALTHY
   (“Calendar connected”, optional “Updated …” timestamp).
2. Open Google Calendar in another browser tab.
3. Create a new event in Google Calendar for today with a recognizable title (for example, "GCal Test Event").
4. Save the event in Google Calendar.
5. Switch back to Compass and wait up to 30 seconds without reloading.

### Expected Results

- The new event appears on the Compass calendar automatically, without a page reload.
- The event's title, time, and date match what was set in Google Calendar.
- The event is not duplicated.

---

## Scenario 4: Real-Time Sync — Event Created In Compass Appears In Google

### UX

Creating a new event in Compass pushes it to Google Calendar in the background. The user does not need to trigger this manually.

### Steps

1. Confirm Google Calendar is connected and HEALTHY.
2. Create a new event in Compass for today with a recognizable title (for example, "Compass Test Event").
3. Switch to Google Calendar in another browser tab and wait up to 30 seconds.

### Expected Results

- The new event appears in Google Calendar without any manual action.
- The event's title and time match what was set in Compass.
- The event is not duplicated in Google Calendar.

---

## Scenario 5: Google Calendar Status Displays As HEALTHY

### UX

After a successful import with no sync infrastructure issues, the sidebar
shows a calm “Calendar connected” status under the account email. No refresh
CTA is shown while healthy.

### Steps

1. Connect Google and let the initial import complete.
2. Read the status line under the account email in the sidebar.

### Expected Results

- The status line reads “Calendar connected.”
- An “Updated …” relative timestamp may appear beneath it when
  `lastSyncedAt` is available.
- The email is not shimmering, and the status is not warning or error color.
- No **Refresh calendar** button is shown.

---

## Scenario 6: Sync Needs Attention — User Triggers A Refresh

### UX

If the sync infrastructure degrades (for example, watch channels expire), the
sidebar status line turns warning-colored (ATTENTION / delayed). The user can
click **Refresh calendar** to catch up recent events and refresh sync
infrastructure.

### Steps

1. Simulate or wait for an ATTENTION state (this can be forced in a dev environment by expiring watch tokens, or observed in a long-running account).
2. Observe the sidebar status line under the account email.
3. Click **Refresh calendar**.
4. Observe the button while the refresh runs (it should show “Refreshing…” and disable).
5. Wait for the refresh to complete.

### Expected Results

- The status line uses warning styling and reads “Calendar updates are taking
  longer than usual. We'll keep trying.” (no “repair” wording).
- **Refresh calendar** is visible as its own button under the status.
- Clicking it calls `useConnectGoogle().refresh` (not a separate repair API);
  the button flips to “Refreshing…” immediately.
- When the refresh completes, status returns to “Calendar connected” (HEALTHY).
- If the manual refresh fails, an error toast appears: “We couldn't refresh
  your calendar. Please try again in a moment.”

---

## Scenario 6b: Automatic Silent Refresh On App Focus

### UX

Compass also runs the same refresh path automatically when a connected
calendar is already `HEALTHY` or `ATTENTION`: once on mount, and again when
the tab returns to visible after being hidden for at least 30 seconds. Focus
refresh is silent — a transient failure must not toast.

### Steps

1. Confirm Google Calendar is connected and HEALTHY.
2. Note the current “Updated …” timestamp (if shown).
3. Switch to another tab/app for at least 30 seconds, then return to Compass.
4. Optionally create an event in Google Calendar while away, then return.

### Expected Results

- Returning after 30+ seconds triggers a silent refresh without a toast on
  success or transient failure.
- A quick alt-tab under 30 seconds does **not** trigger a refresh.
- If a Google-side event was created while away, it appears after the catch-up
  (or via normal SSE) without requiring a manual **Refresh calendar** click.
- While disconnected, reconnect-required, or still importing, focus refresh
  is a no-op.

---

## Scenario 7: Google Access Revoked — Reconnect Required Early And Congruently

### UX

If the user removes Compass's access in Google's account settings (or Google
access otherwise becomes unusable), Compass detects a terminal
reconnect-required state. The user must see one clear story across the UI and
a direct reconnect path **before** they discover the problem by failing to
save an event.

### Steps

1. Connect Google Calendar and let import complete. Confirm several Google events are visible in Compass.
2. In a separate browser tab, go to `myaccount.google.com/permissions`.
3. Find Compass and remove its access.
4. Return to Compass and wait for the app to detect the revocation (may require triggering a sync action or waiting for the next background sync cycle).
5. Before creating or editing any event, inspect the calendar banner, the
   sidebar account Reconnect action, and Settings → Accounts for the affected
   account.
6. Attempt to create an event only after confirming the reconnect-required UX
   is already visible (this step checks that CRUD is not the first signal).

### Expected Results

- As soon as revocation is known, the week/day banner names the affected
  account (or “Google Calendar needs reconnecting.” when the email is
  unknown) with **Reconnect**. The sidebar account row shows **Reconnect
  Google Calendar**. The sidebar footer does not repeat the reconnect
  sentence.
- A named reconnect toast appears only for a live revoke (`410` /
  `GOOGLE_REVOKED`) or a blocked write, not again from a metadata refresh
  while the banner is already on screen.
- Settings → Accounts for the affected account matches the sidebar: it does
  not claim “Calendar connected” / “Updated just now” while reconnect is
  required.
- The user does not need a failed create/edit (`410` / `GOOGLE_REVOKED`) to
  learn that reconnect is required; that failure path is a last resort, not
  the primary signal.
- Last-known Google events for the affected account remain visible as
  **read-only** (inspectable, not editable/deletable/draggable). Creates
  cannot target that account’s calendars.
- If another Google account is still healthy, its events stay writable and
  syncing continues for that account.
- The UI does not later flip into a false healthy or “syncing in the
  background” state while the underlying Google access remains revoked.

---

## Scenario 7b: Status Surfaces Stay Congruent Through False Starts

### UX

While Compass is detecting or applying a reconnect-required state, individual
surfaces may update at slightly different times, but they must converge quickly
to one story. Temporary event visibility or background sync attempts must not
leave a stale “everything is fine” or stale “please reconnect” message behind.

### Steps

1. Start from Scenario 7 after revocation has been detected at least once.
2. Leave the tab open for at least one background sync / focus-refresh cycle
   (wait ~30–60 seconds, or hide the tab for 30+ seconds and return).
3. Open Settings → Accounts and compare it with the calendar banner, the
   sidebar account CTA, and any live-revoke toast.
4. If Google events briefly reappear or the grid goes blank, keep watching the
   status surfaces rather than interacting with events.
5. Complete reconnect from the banner, sidebar account CTA, or live-revoke
   toast, then confirm every reconnect warning clears.

### Expected Results

- Throughout the wait, banner / sidebar / Settings never contradict each other
  for more than a brief transition: reconnect-required and healthy/syncing
  must not be shown as simultaneous truths for the affected account.
- A reconnect toast does not linger after the account is healthy again.
- After a successful reconnect, the banner is gone, the sidebar account CTA
  is gone, and Settings settles to “Calendar connected” (optional
  “Updated …” timestamp). OAuth return does not toast “Calendar connected.”
- Attempting create/edit/delete on the affected account is hard-blocked and
  steers the user back to reconnect rather than sending a doomed `410`.
- UpNext / “All clear” is unrelated to sync health and is not required to
  change for this scenario.

---

## Scenario 8: Re-Connecting Google After Revocation

### UX

After revocation, the user can reconnect Google using the same flow as the
initial connection (banner, sidebar/Settings CTA, or a live-revoke toast). A
new import runs and Google events repopulate the calendar. All previously
action-required surfaces clear together.

### Steps

1. Complete Scenario 7 so the connection is in the reconnect-required state.
2. Choose the banner **Reconnect** action, the matching sidebar / Settings
   CTA, or a live-revoke toast if one is visible.
3. Complete the Google authorization redirect.
4. Wait for the import to complete.

### Expected Results

- The Google authorization redirect returns to Compass without error.
- Compass does not toast “Google Calendar connected.” The sidebar shows
  “Adding your calendar…” with the syncing shimmer during import.
- Google events repopulate the calendar after import completes.
- The sidebar status returns to “Calendar connected” (HEALTHY).
- Settings → Accounts matches the sidebar healthy state.
- The reconnect banner, account CTA, and any live-revoke toast are dismissed
  once reconnect is no longer required.
- Previously revoked-and-removed events reappear if they still exist in Google Calendar.

---

## Scenario 9: Per-Calendar Visibility Persists Across Reload

### UX

The sidebar lists every active calendar under "Calendars" with a visibility
switch per calendar. Turning a calendar off hides its events from the grid
without unsubscribing sync; the choice is a Compass preference that survives
reloads and other sessions, and the server filters what it sends based on it.

### Steps

1. Confirm Google Calendar is connected and import is complete, with at
   least two calendars visible in the sidebar "Calendars" list.
2. Note an event on the grid from a secondary (non-primary) calendar.
3. In the sidebar, toggle that calendar's visibility switch off.
4. Reload the page.
5. Toggle it back on.
6. Sign in with the same account from a second session (a private/incognito
   window works).

### Expected Results

- Turning a calendar off immediately removes its events from the grid, no
  page reload needed.
- After reloading, the calendar still shows off and its events stay hidden —
  the preference is stored server-side (`isVisible`), not just client state.
- The second session shows the same visibility state.
- The event read request (`GET /api/event`) omits events on the hidden
  calendar entirely rather than returning and filtering them client-side —
  confirm via the browser's network inspector.
- Toggling the calendar back on restores its events.

---

## Scenario 10: Google-Side Calendar Changes Reconcile Without A Reset

### UX

Adding, renaming, recoloring, unchecking, removing, or deleting a calendar in
Google Calendar reconciles into the Compass sidebar automatically. None of
these require a reconnect or a full reimport of the account.

Google models two separate things that are easy to confuse, and Compass treats
them differently:

- **Unchecking** a calendar in "My calendars" clears Google's `selected` flag.
  The calendar is still in the account's list, so Compass keeps syncing it.
- **Removing it from the list** sets Google's `hidden` flag. That is what
  stops Compass syncing it — unless Google still reports `selected: true`,
  which means Google is showing its events and Compass keeps importing so a
  still-live calendar cannot be silently skipped while the account reports
  healthy.

So a calendar goes inactive in Compass when Google reports it deleted, or
reports it hidden *and* not selected.

### Steps

1. Confirm Google Calendar is connected and the sidebar "Calendars" list
   matches Google's current calendar set.
2. In Google Calendar's settings, create a new secondary calendar.
3. Wait up to 30 seconds (or trigger a sync — see Scenario 6) and check the
   Compass sidebar.
4. Rename the new calendar in Google Calendar, and change its color.
5. Check Compass again.
6. Uncheck the calendar in "My calendars" (leave it in the list), then check
   Compass.
7. Re-check it.
8. Remove the calendar from your list in Google Calendar (its overflow menu →
   "Hide from list"), without deleting it. Then check Compass.
9. Restore it to the list in Google Calendar, then check Compass.
10. Delete the calendar entirely in Google Calendar.

### Expected Results

- The new calendar appears in the Compass sidebar without a reconnect or
  full reimport; any of its existing events import normally.
- The rename and recolor both reconcile into the sidebar's name and color
  marker.
- Unchecking it in Google changes nothing in Compass: it stays in the sidebar
  and keeps syncing. Compass visibility is its own preference (Scenario 9)
  and is not driven by Google's checkbox.
- Removing it from the Google list drops it from the Compass sidebar and stops
  syncing its events, without touching any other calendar's events or
  visibility.
- Restoring it to the list brings it back under the same Compass identity —
  the same visibility preference as before, not reset to a default.
- Deleting it in Google removes it, and only its own events, from Compass.
- Throughout, every other calendar's events, visibility, and sync state stay
  undisturbed.

---

## Scenario 11: Watch Repair Self-Heals After An Expired Or Deleted Watch

### UX

Compass keeps a live Google notification subscription ("watch") per
syncable calendar. If a watch expires or is deleted outside Compass,
reopening the app repairs it automatically — no manual **Refresh calendar**
click required (compare Scenario 6 for the manual trigger and Scenario 6b
for the automatic focus refresh).

### Steps

1. Confirm Google Calendar is connected and HEALTHY.
2. In a dev environment, expire or delete a watch record (for example, by
   forcing a short `google.channelExpirationMin` and waiting, or by directly
   invalidating the stored watch).
3. Without clicking anything in Compass, close and reopen the tab (or
   reload) to reconnect.
4. Wait a few seconds, then create an event directly in Google Calendar.
5. Switch back to Compass and wait up to 30 seconds.

### Expected Results

- Reopening/reloading the app alone triggers a defensive repair check on
  reconnect — you don't need to notice an ATTENTION state or click
  **Refresh calendar** for the watch to be repaired.
- The sidebar status converges to HEALTHY (“Calendar connected”) on its own.
- The event created directly in Google Calendar appears in Compass without
  a page reload, proving the repaired watch (or the incremental catch-up
  sync behind it) is live again.
- No duplicate events appear as a result of the repair.

---

## Scenario 12: freeBusyReader Calendars Show Availability Without Event Details

### UX

A calendar where your Google access is "See only free/busy" never produces
Compass event records. Compass shows its busy time ranges as inert striped
blocks on the grid, with no event content and no way to interact with them.

### Steps

1. Confirm a `freeBusyReader` calendar is connected and visible in the
   Compass sidebar (see Setup).
2. Create a titled event on that calendar directly in Google Calendar,
   during a time range visible in Compass.
3. Wait up to 30 seconds and check Compass.
4. Try to click, right-click, hover, and drag the striped block that
   appears.

### Expected Results

- Compass shows a diagonally-striped block for the busy period, matching
  the event's time range, with no title or other details shown.
- Left-click does nothing — no form opens.
- Right-click does nothing — no context menu opens.
- The block cannot be dragged, resized, or deleted; no cursor affordance
  suggests it can be.
- The calendar's sidebar visibility toggle still works, hiding/showing its
  busy blocks the same way it hides/shows real events on other calendars.

---

## Scenario 13: Revoked Access Keeps Read-Only Google Data And Protects Other Accounts

### UX

When Google access for an account becomes unusable, Compass keeps that
account’s last-known events visible as read-only and requires reconnect.
Compass-local data and any still-healthy Google accounts are never demoted
or wiped by the broken account’s failure.

### Steps

1. Before connecting Google (or on a separate password-only account),
   create at least one scheduled event on your
   Compass-local calendar.
2. Connect Google Calendar (see Scenario 1) with multiple calendars
   available — at least one writable calendar and, if possible, a reader or
   `freeBusyReader` calendar too. Let import complete. Prefer a second
   healthy Google account when available.
3. Confirm events/availability from every Google calendar are visible,
   alongside your original Compass-local events.
4. Revoke Compass's access for one account at
   `myaccount.google.com/permissions` (see Scenario 7).
5. Return to Compass and wait for the revocation to be detected.

### Expected Results

- The affected account’s calendars remain listed; their events stay visible
  but are read-only until reconnect.
- Writes targeting the affected account are hard-blocked with a reconnect
  path; a healthy sibling account (if present) still accepts CRUD and sync.
- Compass-local events created before Google was connected remain exactly as
  they were.
- The toast and reconnect-prompt behavior matches Scenario 7 (early,
  congruent, named account — not discovered first via a failed event write).

---

## Focused Regression Checks

If time is limited, run these checks before shipping Google sync changes:

1. Connecting Google from a password session begins Sync-owned OAuth and does not lose existing Compass data.
2. The sidebar shows “Adding your calendar…” during import and settles to “Calendar connected” when import completes.
3. The app remains interactive (no blocking overlay) during import.
4. An event created in Google Calendar appears in Compass within ~30 seconds without a page reload.
5. An event created in Compass appears in Google Calendar within ~30 seconds.
6. The sidebar status reads “Calendar connected” when healthy (optional “Updated …” timestamp).
7. An ATTENTION state shows warning status copy and a **Refresh calendar** button.
8. After the refresh completes, status returns to HEALTHY.
9. Returning to a HEALTHY/ATTENTION tab after 30+ seconds hidden triggers a silent refresh with no failure toast.
10. Revoking access shows reconnect-required UX early (calendar banner +
    per-account Reconnect CTA; named toast only on live `410` / blocked
    write) before any failed event create/edit; last-known events stay
    visible read-only and writes to that account are hard-blocked.
11. While reconnect is required, banner / sidebar / Settings tell one story
    for the affected account — never “disconnected” beside “Calendar
    connected” or “Syncing in the background…”. A healthy sibling account
    (including the other provider on the same email) keeps working.
12. Re-connecting after revocation triggers a fresh import, restores writes,
    and clears every reconnect warning together.
13. Hiding/showing a calendar in the sidebar persists across reload, and the server excludes hidden-calendar events from event reads.
14. A Google-side calendar add/rename/recolor/remove/delete reconciles into the
    sidebar without a full reset, and unchecking one in Google does not stop it
    syncing.
15. Reopening the app after a watch expires or is deleted repairs it automatically, with no manual action.
16. A freeBusyReader calendar's busy blocks show no title, details, or event actions.
17. Revoking one account keeps its last-known events read-only, hard-blocks
    its writes, and leaves Compass-local data plus any healthy sibling
    Google account usable.
18. A known terminal reconnect-required state does not later flicker into a
    false healthy or background-syncing state while Google access remains
    revoked.
