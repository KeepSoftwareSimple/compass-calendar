# Compass Desktop (macOS) Acceptance

Manual checks for signed internal or release builds of Compass for macOS.
Automated coverage: `CompassKitTests` and `CompassData` parity fixtures,
`bun cli contracts:swift --check` and `bun cli desktop:export --check` on
Linux CI, XCUITest smoke in
[test-macos.yml](../../.github/workflows/test-macos.yml), and release launch
smoke in [release-macos.yml](../../.github/workflows/release-macos.yml).

Record pass or fail on tracking issue
[#4215](https://github.com/KeepSoftwareSimple/compass-calendar/issues/4215)
with the build string from **Compass → About Compass** (version and bundle
version).

## Scope

Use this runbook on a **signed, notarized DMG** from a `macos-v*` GitHub
Release or the rolling `macos-dev` prerelease, installed to `/Applications`.
Unsigned Xcode builds are fine for day-to-day development but skip checks
that need Notification Center, reliable OAuth relay, or Sparkle.

The calendar surface is **fully native Swift** (no embedded web calendar).
Hosted web pages still open for OAuth, Stripe Checkout, and help links.

Do not enter production credentials on staging unless you switched hosts on
purpose for QA.

## Setup

1. Download the DMG from the GitHub Release (or dev channel) for the build
   under test.
2. Drag **Compass** to `/Applications` and open it from there (not from the
   DMG volume).
3. Confirm **About Compass** shows the expected marketing version.
4. Stay signed in to macOS with notification permissions available for the
   test user account.

---

## Check 1: Install and first launch

### Steps

1. Open Compass from `/Applications`.
2. Wait for the main window to show the native calendar (week or day grid,
   sidebar, header).

### Expected

- No Gatekeeper block after install from the signed DMG.
- Native chrome renders in the chosen theme; traffic lights sit above the
  header without overlap.
- Production API host by default (`www.compasscalendar.com`).

## Check 2: Sign-in relay (Google)

Google sign-in must run in the system browser session and return via
`compass://`.

### Steps

1. Log out if already signed in.
2. Start **Sign in with Google** from the native auth UI.
3. Complete sign-in in the authentication session (Safari sheet or browser).
4. Confirm the app receives the callback and lands signed in.

### Expected

- No embedded-web-view blocked sign-in error.
- After redirect, the session is authenticated and production events load on
  the native grid.

## Check 3: Sign-in (password or second provider)

### Steps

1. With a fresh profile or after logout, sign in with email and password, or
   repeat the browser relay for Microsoft or Sign in with Apple if you use
   those providers in production.

### Expected

- Password auth completes in the native flow.
- Other providers use the same relay pattern as Google when offered.

## Check 4: Keyboard create (timed event)

### Steps

1. From the grid with no form open, use the timed-create shortcut (`e` then
   `t`, or **File → New Event**).
2. Enter a title and save.

### Expected

- Native event form opens and closes without mouse-only steps.
- The new event appears on the grid after save.

## Check 5: Command palette and shortcuts legend

### Steps

1. Open the command palette from the keyboard shortcut or **View → Command
   Palette**.
2. Open the shortcuts legend (`?` or **Help → Compass Help**).

### Expected

- Palette searches and runs at least one navigation command.
- Legend lists bindings that match the exported shortcut registry.

## Check 6: Notification with window closed

### Steps

1. Allow notifications when the app prompts.
2. Create or use an event starting within the notifier lead time.
3. Close the main Compass window (app stays running; menu bar icon may
   remain).
4. Wait for the macOS notification.

### Expected

- A native notification appears while the window is closed.
- Clicking the notification focuses the app and navigates to the event.

## Check 7: Dock badge

### Steps

1. Sign in with upcoming events today.
2. Observe the Compass icon in the Dock.

### Expected

- Dock badge reflects the count of upcoming events today (or hides when
  zero), matching agenda data after sync.

## Check 8: Menu bar agenda

### Steps

1. With upcoming events today, click the Compass status item in the menu bar.

### Expected

- Menu lists upcoming items with sensible titles and times.
- Choosing an item opens or focuses the main window on that event.

## Check 9: Native main menu

### Steps

1. Use **Compass** menu entries (**About Compass**, **Settings…**, **Quit
   Compass**).
2. Use **View → Today** (or the Today shortcut).

### Expected

- Menu actions update native UI state without errors.
- **Today** moves the grid to the current date.

## Check 10: Global quick-add hotkey

### Steps

1. Press the configured global quick-add shortcut (default
   Control+Option+Command+Space unless changed in Settings).
2. Add a title and save a timed event.
3. Dismiss the panel.

### Expected

- Quick-add panel opens above other apps.
- New event appears on the calendar after save.

## Check 11: Sparkle update

Run when two internal tags exist (for example `macos-v0.1.0` then
`macos-v0.1.1`), or when the dev channel has a newer build.

### Steps

1. Install the older tag's DMG (or an older dev build).
2. Launch and wait for the in-app update prompt (or **Check for Updates…**).
3. Accept update and restart when prompted.
4. Confirm **About Compass** shows the newer version.

### Expected

- Update downloads from the GitHub Release appcast without manual DMG install.
- Restart leaves settings and sign-in intact.

## Check 12: Sleep and wake recovery

### Steps

1. With Compass running and signed in, put the Mac to sleep for at least one
   minute.
2. Wake and return to Compass without force-quitting.

### Expected

- Native grid reloads or resumes; no blank window.
- SSE or cache refresh recovers without requiring a full sign-out.

## Check 13: Host switch (staging)

Use a **dev-channel**, **DEBUG**, or **Option-at-launch** build so the
**Debug** menu is visible (see
[local development](../development/local-development.md#compass-for-macos)).

### Steps

1. Choose **Debug → Switch to Staging**.
2. Sign in or confirm API traffic targets staging (Settings or network log).
3. Choose **Debug → Switch to Production** and confirm return to production.

### Expected

- Host preference persists across relaunch until switched again.
- Staging is only for QA; release builds default to production.

## Check 14: Deep link focus

### Steps

1. With Compass running, open a safe `compass://` link from Terminal or
   Notes (for example a billing or auth callback path used in QA).

### Expected

- App activates and routes the deep link in native code without crash.

## Check 15: Quit and relaunch persistence

### Steps

1. Resize the window and sign in.
2. Quit Compass from the menu.
3. Relaunch from `/Applications`.

### Expected

- Window frame and Keychain session persist.
- No spurious auth loop on relaunch.
