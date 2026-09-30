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

A native Mac app with everything the web client does, plus the things only a
desktop app can do: a menu bar agenda, native notifications that fire with the
window closed, a Dock badge, a global quick-add hotkey, native menus and
shortcuts, deep links, launch at login, and silent auto-updates.

macOS only. Windows and Linux are out of scope and may never ship.

## Decisions

Each of these is a judgment call. Tyler can veto any of them on #4149 or in
the PR that adds this doc. After that they are settled.

1. **Electron shell that loads the hosted web app.** The renderer loads
   `https://compasscalendar.com` (or staging) over the network, exactly like a
   browser tab. Zero web build changes, zero auth changes, one deploy updates
   every desktop user the same minute the web updates. Not Tauri (Rust
   toolchain, WebKit quirks, no Playwright driver). Not Swift (a month is not
   enough to rebuild the calendar). Not a bundled offline copy of the web
   bundle (that needs header sessions, cookieless SSE, and a new CORS origin
   for no October value). Bundling can be revisited after launch if load time
   or offline start becomes a real complaint.
2. **One new app, `apps/calendar-desktop`.** Main process, preload bridge,
   packaging, tests. The web app stays the only UI. It learns it is inside the
   desktop shell by feature-detecting `window.compassDesktop`, never by user
   agent.
3. **OAuth runs in the system browser and relays back with a deep link.**
   Google refuses sign-in inside embedded browsers, and Electron is one. The
   shell opens any navigation off the app origin in Safari (or the default
   browser). The existing web callback page, when the OAuth `state` carries a
   desktop marker, redirects to `compass://auth/<provider>/callback?...`
   instead of finishing the exchange itself. The desktop window receives the
   deep link and finishes the exchange, so the session cookie lands in the
   app. No new OAuth clients, no new redirect URIs in Google, Microsoft, or
   Apple consoles. Email and password login works in-window as is.
4. **Distribution is a signed, notarized, universal DMG on GitHub Releases,
   with `electron-updater` for silent updates.** The repo is public, so
   release assets download without auth. Tags `desktop-v0.x.y` build internal
   releases in October; `desktop-v1.0.0` is the public one. No Mac App Store
   for v1 (sandbox and review add weeks). No Homebrew cask for v1.
5. **Internal builds default to production.** Dogfooding staging data is not
   dogfooding. A hidden **Switch to staging** menu item exists for QA. This
   requires one production web deploy that carries the web-side changes
   (item 5 in the setup list).
6. **Native features are tiered.** Tier 1 ships before internal testing
   starts. Tier 2 lands during October. Everything else waits until after
   Nov 1. The issues on the milestone carry the tier in their title.

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
| 3 | App Store Connect API key for notarization | [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API → Team Keys → **+**. Name `compass-notary`, role Developer. Download the `.p8` once (it cannot be downloaded again). Note the Key ID and the Issuer ID shown above the table. | Repo secrets `APPLE_API_KEY_P8` (file contents), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | 5 min |
| 4 | App icon | A 1024x1024 PNG of the Compass mark on a solid or squircle background. If none exists, the loop derives one from the favicon and flags it as placeholder. | Commit to `apps/calendar-desktop/build/icon.png`, or attach it to the WP-01 issue | 5 min |
| 5 | One production deploy after WP-02 merges | `deploy-production.yml` → Run workflow with the release tag that contains the web callback relay and desktop bridge. Until this runs, internal builds only work against staging. | GitHub Actions | 5 min plus the deploy |
| 6 | Agent loop config | Add milestone **Desktop v1** to the front of repo var `AGENT_LOOP_MILESTONES`. Confirm `AGENT_LOOP_ENABLED` is `true`. Nothing else in [Agent loop Routine](../CI-CD/agent-loop-routine.md) changes. | Repo variables | 2 min |
| 7 | A Mac to test on | macOS 13 or newer. Both Intel and Apple Silicon are covered by the universal build, so one machine is enough. | Nowhere | 0 |

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
apps/calendar-desktop/
  src/main/         Electron main: window, menu, tray, deep links, updater
  src/preload/      contextBridge exposing window.compassDesktop
  src/shared/       pure TS used by main and tests (agenda formatting, deep link parsing, menu model)
  build/            icon, entitlements, electron-builder config
  package.json      electron, electron-builder, electron-updater only
```

- **Main process** is plain TypeScript bundled with `bun build --target=node`
  and run by Electron. No framework. State that needs to survive restarts
  (window bounds, staging switch, hotkey) lives in one JSON file under
  `app.getPath("userData")`.
- **Preload** exposes a small, versioned API and only when the page origin
  matches the configured app URL: `openExternal`, `setAgenda`, `onDeepLink`,
  `onUpdateReady`, `restartToUpdate`, `platform`. Every message is validated
  with a Zod schema from `packages/core` on both sides.
- **Renderer** is the hosted web app. Desktop-only behavior lives behind
  `isDesktop()` and stays small: the drag region, the OAuth relay, the agenda
  push, the update toast. No forked components.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, `webSecurity` untouched, `will-navigate` and
  `setWindowOpenHandler` allow only the app origin, permission requests
  denied except notifications. Hardened runtime with the minimum
  entitlements electron-builder needs for notarization.
- **Notifications** need no new code path. Electron maps the renderer's
  `Notification` API to macOS Notification Center, so the existing
  `useUpcomingEventNotifier` works once the app stays alive with the window
  closed.
- **Versioning**: the desktop app has its own semver in
  `apps/calendar-desktop/package.json`, tagged `desktop-vX.Y.Z`, independent
  of the web `vX.Y.Z` tags. `useVersionCheck` keeps working for the web
  bundle inside the shell.

## Work packages and QA

One agent-task issue per work package on the milestone, `Depends on:`
lines for order, partition label `desktop`. Agents cannot run macOS: unit
tests, web tests, a Playwright Electron smoke on Linux, and a notarized
launch on a macOS runner cover what they can. Visual and Notification
Center checks are the owner's, recorded on #4149. Dogfood bugs are new
`desktop` issues on the milestone and outrank features from the third week.

## Later, explicitly not v1

- Bundled offline web assets and an offline-first start.
- EventKit integration for local macOS calendars (iCloud already works over
  CalDAV).
- Mac App Store and Homebrew cask distribution.
- Multiple windows, Spotlight indexing, Shortcuts.app actions, Handoff.
- Windows and Linux builds.

## Risks

| Risk | Mitigation |
| --- | --- |
| Apple enrollment or agreement acceptance delays signing | Start today. Unsigned dev builds still run locally with a right-click Open. |
| Google rejects the desktop OAuth relay flow | The relay uses the existing web redirect URI; Google only sees Safari. Verified first in WP-04 against staging. |
| Notifications do not appear for an unsigned or non-Applications build | Internal builds are signed from WP-03 on. The acceptance doc says to install to /Applications. |
| Web deploy and shell drift | The bridge is versioned and the web feature-detects every method. An old shell against a new web keeps working. |
| Playwright Electron smoke is flaky on Linux CI | Smoke asserts launch, route, and one menu dispatch only. Visual checks stay manual. |
| Tyler's QA time in October | Acceptance doc is under 15 checks and only re-run for builds that touch them. |
