# Compass Desktop (macOS)

**Status:** Planned, drafted 2026-09-30. Work is tracked on GitHub: the
[Compass Desktop board](https://github.com/orgs/KeepSoftwareSimple/projects/9),
[milestone Desktop v1](https://github.com/KeepSoftwareSimple/compass-calendar/milestone/44),
and the tracking issue
[#4149](https://github.com/KeepSoftwareSimple/compass-calendar/issues/4149).
This doc holds the decisions and the reference material only.

**Owner:** Tyler (credentials, production deploys, QA). Agents build the rest
through the agent loop.

## Goal

A native Mac app, built in Swift with Xcode, with everything the web client
does plus the things only a Mac app can do: a menu bar agenda, native notifications that fire with the
window closed, a Dock badge, a global quick-add hotkey, native menus and
shortcuts, deep links, launch at login, and silent auto-updates.

macOS only. Windows and Linux are out of scope and may never ship.

## Decisions

Each of these is a judgment call. Tyler can veto any of them on #4149 or in
the PR that adds this doc. After that they are settled.

1. **A Swift app whose window hosts the web app in WKWebView.** The shell
   is native: AppKit window, menus, menu bar item, notifications, Dock, deep
   links, hotkeys, and updates are all Swift. The calendar surface inside the
   window is the hosted web app at `https://compasscalendar.com` (or
   staging), loaded over the network like a Safari tab. Zero web build
   changes, zero auth changes, one web deploy updates every Mac user the
   same minute. Not Electron: no Chromium, no Node, a real `.app` that is
   not App Store bound (see decision 4). Not a native rewrite of the calendar UI for v1:
   a month is not enough to rebuild the grid, recurrence, forms, palette,
   and shortcuts in SwiftUI with parity, so that is a post-launch track if
   wanted. Not a bundled offline copy of the web bundle (that needs header
   sessions, cookieless SSE, and a new CORS origin for no October value).
2. **One new app, `apps/calendar-macos`.** An XcodeGen `project.yml` (text,
   diffable, no checked-in `.xcodeproj`), Swift sources, XCTest and XCUITest
   targets. The web app stays the only calendar UI. It learns it is inside
   the Mac app by feature-detecting `window.compassDesktop`, injected by a
   `WKUserScript`, never by user agent.
3. **OAuth runs in the default browser and relays back with a deep link.**
   Google refuses sign-in inside embedded web views, and WKWebView is one.
   The shell opens any navigation off the app origin with `NSWorkspace`. The
   existing web callback page, when the OAuth `state` carries a desktop
   marker, redirects to `compass://auth/<provider>/callback?...` instead of
   finishing the exchange itself. The app receives the deep link and hands
   it to the web view, which finishes the exchange, so the session cookie
   lands in the app's persistent `WKWebsiteDataStore`. No new OAuth clients,
   no new redirect URIs in Google, Microsoft, or Apple consoles. Email and
   password login works in-window as is.
4. **Distribution is a signed, notarized, universal DMG on GitHub Releases,
   with Sparkle for silent updates.** The repo is public, so release assets
   and the Sparkle appcast download without auth. Tags `macos-v0.x.y` build
   internal releases in October; `macos-v1.0.0` is the public one. No Mac
   App Store, ever (decided 2026-10-01): it would force In-App Purchase for
   subscriptions, the sandbox, and review of a web-wrapper app, and it
   conflicts with Sparkle. No Homebrew cask for v1. The updater stays off until
   `SUPublicEDKey` in `Resources/Info.plist` holds the public key, so unsigned
   local builds never self-update. The appcast lives on the rolling
   `macos-appcast` release because `releases/latest` belongs to the web tags.
5. **Internal builds default to production.** Dogfooding staging data is not
   dogfooding. A hidden **Switch to staging** menu item exists for QA. This
   requires one production web deploy that carries the web-side changes
   (item 5 in the setup list).
6. **Native features are tiered.** Tier 1 ships before internal testing
   starts. Tier 2 lands during October. Everything else waits until after
   Nov 1. The issues on the milestone carry the tier in their title.
7. **Every build and test runs on GitHub's macOS runners.** Agents work on
   Linux and cannot compile AppKit, so the loop is: push, CI builds and runs
   XCTest and XCUITest on `macos-latest`, fix, push. One CI round per change
   instead of a local run. Pure Swift logic is kept in a separate SwiftPM
   target so most tests are fast and do not need a window.

## Owner setup reference

The checklist lives on #4149. This table is the how-to for each item.

If the Apple Developer Program enrollment from
[Sign in with Apple](../self-hosting/apple-calendar.md) is already active,
budget 45 minutes. If not, enrollment takes 24 to 48 hours of Apple review,
so start it today.

| # | What | Where to get it | Where to put it | Time |
| --- | --- | --- | --- | --- |
| 1 | Apple Developer Program membership (Team ID) | [developer.apple.com](https://developer.apple.com/programs/enroll/). Also accept the latest agreements at the same site; notarization fails silently on a pending agreement. | Repo secret `APPLE_TEAM_ID` | 2 min if enrolled |
| 2 | Developer ID Application certificate as `.p12` | Keychain Access → Certificate Assistant → Request a Certificate from a CA (save to disk). Then developer.apple.com → Certificates → **+** → **Developer ID Application** → upload the request → download the `.cer` → double-click to install. Keychain Access → My Certificates → right-click the `Developer ID Application:` entry → Export as `.p12` with a password. Run `base64 -i cert.p12 \| pbcopy`. | Repo secrets `CSC_LINK` (the base64) and `CSC_KEY_PASSWORD` | 15 min |
| 3 | App Store Connect API key for notarization (`notarytool`) | [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API → Team Keys → **+**. Name `compass-notary`, role Developer. Download the `.p8` once (it cannot be downloaded again). Note the Key ID and the Issuer ID shown above the table. | Repo secrets `APPLE_API_KEY_P8` (file contents), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | 5 min |
| 4 | App icon | A 1024x1024 PNG of the Compass mark on a solid or squircle background. If none exists, the loop derives one from the favicon and flags it as placeholder. | Commit to `apps/calendar-macos/Resources/icon.png`, or attach it to the tracking issue | 5 min |
| 5 | One production deploy after WP-02 merges | `deploy-production.yml` → Run workflow with the release tag that contains the web callback relay and desktop bridge. Until this runs, internal builds only work against staging. | GitHub Actions | 5 min plus the deploy |
| 6 | Agent loop config | Add milestone **Desktop v1** to the front of repo var `AGENT_LOOP_MILESTONES`. Confirm `AGENT_LOOP_ENABLED` is `true`. Nothing else in [Agent loop Routine](../CI-CD/agent-loop-routine.md) changes. | Repo variables | 2 min |
| 7 | Sparkle update-signing key | On any Mac: download the [Sparkle](https://sparkle-project.org) release, run `bin/generate_keys` from it. It stores the private key in the login keychain and prints the public key. Export the private key with `bin/generate_keys -x sparkle.key`. | Repo secret `SPARKLE_PRIVATE_KEY` (file contents). The public key goes in `Info.plist` via the WP-05 PR; paste it on the tracking issue. | 5 min |
| 8 | A Mac to test on | macOS 13 or newer. Both Intel and Apple Silicon are covered by the universal build, so one machine is enough. | Nowhere | 0 |

Defaults chosen in this plan, listed on #4149 for confirmation:

- App name **Compass**, bundle id `com.compasscalendar.desktop`, URL scheme
  `compass://`.
- Minimum macOS **13 Ventura**.
- Internal builds default to **production**; the staging switch is a hidden
  menu item.
- Releases live on this repo's GitHub Releases page under `desktop-v*` tags.
- The Nov 1 email and the download page copy are Tyler's. The loop provides
  the download URL and a screenshot set.

Nothing else is needed. PostHog, Discord, Google, Microsoft, Apple sign-in,
and SuperTokens keep their current configuration. There is no new backend
service and no new secret on the backend.

## Architecture

```text
apps/calendar-macos/
  project.yml            XcodeGen spec: app target, CompassKit package, test targets
  Compass/               AppKit app: AppDelegate, window, WKWebView host, menus, status item
  Compass/Bridge/        WKUserScript that injects window.compassDesktop; WKScriptMessageHandler
  CompassKit/            pure Swift package: agenda formatting, deep link parsing, menu model, bridge message codec
  CompassKitTests/       XCTest for CompassKit, no AppKit
  CompassUITests/        XCUITest smoke: launch, web loads, deep link, one menu item
  Resources/             icon, entitlements, Info.plist values, offline.html
```

- **App** is AppKit with SwiftUI where it is simpler (the quick-add panel,
  settings). One window, `.fullSizeContentView` with a transparent title bar
  so the calendar runs edge to edge under the traffic lights. Persistent
  state (window frame, staging switch, hotkey) lives in `UserDefaults`.
- **Bridge**: a `WKUserScript` at document start defines
  `window.compassDesktop` with a version and the methods `openExternal`,
  `setAgenda`, `restartToUpdate`, and `platform`; calls post to
  `window.webkit.messageHandlers.compass`. The shell calls back into the page
  with `evaluateJavaScript` for `onDeepLink` and `onUpdateReady`. The script
  is injected only for the configured app origin. Messages are JSON, decoded
  with `Codable` on the Swift side and a Zod schema from `packages/core` on
  the web side.
- **Web view** uses the default persistent `WKWebsiteDataStore`, so cookies,
  IndexedDB, and localStorage survive restarts. `decidePolicyFor` allows the
  app origin and hands everything else to `NSWorkspace.shared.open`.
- **Notifications** go through `UNUserNotificationCenter`. The existing
  `notification.port.ts` gets a desktop implementation that posts through
  the bridge, so `useUpcomingEventNotifier` is unchanged and fires while the
  window is closed (`applicationShouldTerminateAfterLastWindowClosed` is
  false).
- **Signing**: Developer ID, hardened runtime, entitlements limited to
  network client and notifications; notarized with `notarytool`, stapled.
- **Versioning**: `MARKETING_VERSION` in `project.yml`, tagged
  `macos-vX.Y.Z`, independent of the web `vX.Y.Z` tags. Sparkle reads the
  appcast published with each GitHub Release. `useVersionCheck` keeps
  working for the web bundle inside the window.

## Work packages and QA

One agent-task issue per work package on the milestone, `Depends on:`
lines for order, partition label `desktop`. Agents cannot run macOS
locally: XCTest on `CompassKit`, web tests for the bridge contract, and an
XCUITest smoke plus a notarized launch on the macOS runner cover what they
can. Visual and Notification Center checks are the owner's, recorded on
#4149. Dogfood bugs are new
`desktop` issues on the milestone and outrank features from the third week.

## Later, explicitly not v1

- A native SwiftUI calendar UI replacing the web view, screen by screen.
- Bundled offline web assets and an offline-first start.
- WidgetKit today widget, Shortcuts.app actions, Spotlight indexing.
- EventKit integration for local macOS calendars (iCloud already works over
  CalDAV).
- Homebrew cask distribution. The Mac App Store is ruled out.
- Multiple windows and Handoff.
- Windows and Linux builds.

## Risks

| Risk | Mitigation |
| --- | --- |
| Apple enrollment or agreement acceptance delays signing | Start today. Unsigned dev builds still run locally with a right-click Open. |
| Google rejects the desktop OAuth relay flow | The relay uses the existing web redirect URI; Google only sees the default browser. Verified first in WP-04 against staging. |
| Notifications do not appear for an unsigned or non-Applications build | Internal builds are signed from WP-03 on. The acceptance doc says to install to /Applications. |
| WebKit renders the calendar differently from Chromium | The web app is already tested in Safari by users; WKWebView is the same engine. Any gap found in dogfooding is a web bug fixed for Safari users too. |
| Every change costs a macOS CI round | Logic lives in `CompassKit` with fast XCTest; the app target is thin. The build job caches SwiftPM and derived data. |
| Web deploy and shell drift | The bridge is versioned and the web feature-detects every method. An old shell against a new web keeps working. |
| XCUITest smoke is flaky on the runner | Smoke asserts launch, web load, deep link, and one menu dispatch only. Visual checks stay manual. |
| Tyler's QA time in October | Acceptance doc is under 15 checks and only re-run for builds that touch them. |
