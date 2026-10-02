# Compass Desktop (macOS) Acceptance

Manual checks for signed internal or release builds of Compass for macOS.
Automated coverage: `CompassKitTests`, bridge web tests, XCUITest smoke in
[test-macos.yml](../../.github/workflows/test-macos.yml), and release launch
smoke in [release-macos.yml](../../.github/workflows/release-macos.yml).

Record pass or fail on tracking issue
[#4149](https://github.com/KeepSoftwareSimple/compass-calendar/issues/4149)
with the build string from **Compass → About Compass** (version and bundle
version).

## Scope

Use this runbook on a **signed, notarized DMG** from a `macos-v*` GitHub
Release, installed to `/Applications`. Unsigned Xcode builds are fine for
shell debugging but skip checks that need Notification Center, reliable
OAuth relay, or Sparkle.

Do not enter production credentials on staging unless you switched hosts on
purpose for QA.

## Setup

1. Download the DMG from the GitHub Release for the build under test.
2. Drag **Compass** to `/Applications` and open it from there (not from the
   DMG volume).
3. Confirm **About Compass** shows the expected marketing version.
4. Stay signed in to macOS with notification permissions available for the
   test user account.

---

## Check 1: Install and first launch

### Steps

1. Open Compass from `/Applications`.
2. Wait for the main window to show the calendar shell (web content loaded).

### Expected

- No Gatekeeper block after install from the signed DMG.
- Main window appears with calendar UI (production host by default).

## Check 2: Sign-in relay (Google)

Google sign-in must run in the default browser and return via `compass://`.

### Steps

1. Log out if already signed in.
2. Start **Sign in with Google** from the in-app auth UI.
3. Complete sign-in in Safari or your default browser.
4. Confirm the app receives the callback and lands signed in.

### Expected

- Browser opens for Google; the embedded web view does not show Google's
  blocked embedded sign-in error.
- After redirect, the app session is authenticated and the calendar loads.

## Check 3: Sign-in (password or second provider)

### Steps

1. With a fresh profile or after logout, sign in with email and password, or
   repeat the browser relay for Microsoft or Sign in with Apple if you use
   those providers in production.

### Expected

- Password auth completes inside the window.
- Other providers use the same browser relay pattern as Google when offered.

## Check 4: Notification with window closed

### Steps

1. Allow notifications when the app prompts.
2. Create or use an event starting within the notifier lead time.
3. Close the main Compass window (app stays running; menu bar icon may remain).
4. Wait for the macOS notification.

### Expected

- A native notification appears while the window is closed.
- Clicking the notification focuses the app and navigates to the event when
  implemented for that build.

## Check 5: Dock badge

### Steps

1. Sign in with upcoming events today.
2. Observe the Compass icon in the Dock.

### Expected

- Dock badge reflects the count of upcoming events today (or hides when zero),
  matching web-side agenda data after sync.

## Check 6: Menu bar agenda

### Steps

1. With upcoming events today, click the Compass status item in the menu bar.

### Expected

- Menu lists upcoming items with sensible titles and times.
- Choosing an item opens or focuses the main window on that event.

## Check 7: Native main menu

### Steps

1. Use **Compass** menu entries (for example **About Compass**, standard
   **Hide Compass**, **Quit Compass**).
2. Use at least one calendar command exposed in the native menu (for example
   **Go to Today** if present).

### Expected

- Menu actions dispatch to the web app or AppKit as designed without errors.

## Check 8: Global quick-add hotkey

### Steps

1. Press the configured global quick-add shortcut (default
   Control+Option+Command+Space unless changed in Settings).
2. Add a title and save a timed event.
3. Dismiss the panel.

### Expected

- Quick-add panel opens above other apps.
- New event appears in the calendar after save.

## Check 9: Sparkle update

Run when two internal tags exist (for example `macos-v0.1.0` then
`macos-v0.1.1`).

### Steps

1. Install the older tag's DMG.
2. Launch and wait for the in-app update prompt (or check for update if
   exposed).
3. Accept update and restart when prompted.
4. Confirm **About Compass** shows the newer version.

### Expected

- Update downloads from the GitHub Release appcast without manual DMG install.
- Restart leaves settings and sign-in intact.

## Check 10: Sleep and wake recovery

### Steps

1. With Compass running and signed in, put the Mac to sleep for at least one
   minute.
2. Wake and return to Compass without force-quitting.

### Expected

- Calendar reloads or resumes; no permanent blank web view.
- SSE or sync recovers without requiring a full sign-out.

## Check 11: Offline page

### Steps

1. Disable network (Wi-Fi off or airplane mode).
2. Reload or launch Compass if needed to trigger load failure.
3. Confirm the offline page appears and use **Try again** after restoring
   network.

### Expected

- Bundled offline page explains the state and offers retry.
- After network returns, the app loads the configured host again.

## Check 12: Staging switch

### Steps

1. From the Compass menu, choose **Switch to Staging**.
2. Confirm the loaded host is staging (URL bar is not visible; use staging-only
   UI or network logging if needed).
3. Choose **Switch to Production** and confirm return to production.

### Expected

- Host preference persists across relaunch until switched again.
- Staging is only for QA; default for release builds remains production.

## Check 13: Deep link focus

### Steps

1. With Compass running, open a `compass://` auth or navigation link from
   Terminal or Notes (use a safe test path documented for your build).

### Expected

- App activates and the web view handles the deep link without crash.

## Check 14: Quit and relaunch persistence

### Steps

1. Resize the window and sign in.
2. Quit Compass from the menu.
3. Relaunch from `/Applications`.

### Expected

- Window frame and session persist (cookies in the app web data store).
- No spurious auth loop on relaunch.
