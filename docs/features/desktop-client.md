# Compass Desktop (macOS)

**Status:** Planned, drafted 2026-09-30

**Owner:** Tyler (credentials, production deploys, QA). Agents build the rest
through the agent loop.

**Dates:** internal test build in Tyler's hands by **Oct 10**. Dogfood and
iterate through October. Public download in the **Nov 1** email.

## Goal

A native Mac app with everything the web client does, plus the things only a
desktop app can do: a menu bar agenda, native notifications that fire with the
window closed, a Dock badge, a global quick-add hotkey, native menus and
shortcuts, deep links, launch at login, and silent auto-updates.

macOS only. Windows and Linux are out of scope and may never ship.

## Decisions

Each of these is a judgment call. Tyler can veto any of them in the PR that
adds this doc. After that they are settled.

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
   Nov 1. See **Work packages**.

## Tyler's one-hour setup

Do these once, in order. Nothing in the loop needs a human after this list
is done, except production deploys and QA.

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

Confirm or change these defaults by editing this doc in the plan PR:

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

## Timeline

| Week | Dates | Outcome |
| --- | --- | --- |
| 0 | Sep 30 to Oct 3 | Plan merged. Setup list done. WP-01 and WP-02 open. An unsigned dev build runs locally. |
| 1 | Oct 6 to 10 | Signed, notarized DMG from CI. OAuth relay and deep links work. Auto-update works between two internal tags. **Internal build in Tyler's hands.** |
| 2 | Oct 13 to 17 | Tier 1 native features: notifications in background, Dock badge, menu bar agenda, native menus, external links, window state, hide-on-close. |
| 3 | Oct 20 to 24 | Tier 2: global quick-add hotkey, launch at login, sleep and resume resilience, offline page, appearance sync. Playwright Electron smoke gates the release workflow. |
| 4 | Oct 27 to 31 | Feature freeze Oct 27. QA fixes only. `desktop-v1.0.0` tagged Oct 30. Download page live. Email goes Nov 1. |

QA feedback from Tyler enters the queue as issues labeled `desktop` on the
**Desktop v1** milestone. The loop drains them in order. Bugs outrank
features from week 3 on.

## Work packages

One agent-task issue per row, created from
`.github/ISSUE_TEMPLATE/3-agent-task.yml`, milestone **Desktop v1**,
partition label `desktop` (WP-00 adds the label). Each WP is under the
4000-line merge-guard rail. Each ships through the normal
[ship](../../.agents/skills/ship/SKILL.md) path.

| WP | Finish line | Scope |
| --- | --- | --- |
| 00 | `desktop` is a partition label in `agent-loop-next.sh`; `verify.ts` maps `apps/calendar-desktop/` to `test:desktop`; `knip.json`, `tsconfig.typecheck.json`, and `bun lint` include the new app | scripts, docs |
| 01 | `bun dev:desktop` opens a window showing the calendar from `COMPASS_DESKTOP_APP_URL` (default staging). `contextIsolation` on, `nodeIntegration` off, `sandbox` on, navigation locked to the app origin, everything else opens externally. Window bounds persist. `bun test:desktop` runs main-process unit tests. | desktop |
| 02 | Web knows it is in the shell: `window.compassDesktop` bridge typed in `packages/core`, an `isDesktop()` helper, PostHog `platform: desktop`, a drag region for the hidden-inset title bar, and the OAuth callback relay described in decision 3. Covered by web tests. | core, web |
| 03 | `release-desktop.yml`: tag `desktop-v*` builds a universal DMG on `macos-latest`, signs with the Developer ID cert, notarizes with the API key, staples, uploads to a GitHub Release with `latest-mac.yml`. `spctl --assess` passes in CI. | desktop, docs |
| 04 | Deep links: `compass://` registered, single-instance lock, `open-url` handled cold and warm, OAuth relay end to end for Google, Microsoft, and Apple sign-in. `compass://day/2026-10-15` opens that day. | desktop, web |
| 05 | Auto-update: check on launch and every six hours, download silently, **Restart to update** in the app menu, and a toast in the web app when an update is ready. Verified between two internal tags. | desktop, web |
| 06 | Tier 1, notifications: the app keeps running when the window closes (Dock icon stays), the existing upcoming-event notifier fires through macOS Notification Center, clicking one focuses the event. Reuses `notification.port.ts`; no second notifier. | desktop, web |
| 07 | Tier 1, agenda surfaces: the web app pushes today's agenda to the shell on every event-cache change. The shell shows a Dock badge with the count of remaining events and a menu bar item with **Next: <title> in 12m** and a dropdown of the day. Click opens the event. | desktop, web |
| 08 | Tier 1, native menus: an app menu with **New event**, **Command palette**, **Today**, view switching, and **Settings**, each dispatching the existing web shortcut. Native context menu for cut, copy, paste, and spellcheck in text fields. Hidden **Switch to staging** under a debug submenu. | desktop, web |
| 09 | Tier 2, quick add: a global hotkey (default `Ctrl+Opt+Cmd+Space`, changeable in Settings) raises a small always-on-top window with the command palette in create mode; Escape returns focus to the previous app. | desktop, web |
| 10 | Tier 2, resilience: reconnect SSE and refresh the session on wake from sleep and on network return; an offline page with a retry button when the app URL fails to load; launch at login toggle; `nativeTheme` follows the web theme setting. | desktop, web |
| 11 | Playwright `_electron` smoke on Linux CI against a local web build (launch, anonymous calendar renders, deep link routes, menu dispatches a shortcut). A macOS runner smoke launches the notarized build once per release tag. | desktop, e2e |
| 12 | Docs: `docs/features/desktop-client.md` becomes the feature doc, `docs/development/local-development.md` gains the desktop dev section, `docs/CI-CD/workflows.md` gains `release-desktop.yml`, and the acceptance runbook `docs/acceptance/desktop.md` lists the manual checks Tyler runs on each internal build. | docs |

WP-01 through WP-05 are the internal-build gate. WP-06 through WP-08 are
Tier 1. WP-09 through WP-11 are Tier 2. WP-12 rides along at the end.

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

## QA loop in October

Agents cannot run macOS. The loop covers logic with `bun test:desktop`, the
renderer contract with web tests, and launch behavior with the Playwright
Electron smoke on Linux plus a notarized-build launch on the macOS runner.
Everything visual or Notification Center related is Tyler's to check.

1. A new `desktop-v0.x.y` tag lands whenever a WP merges and the smoke is
   green. The app updates itself; nothing to download after the first DMG.
2. Tyler runs `docs/acceptance/desktop.md` (WP-12) when a build changes
   something on that list, and files anything wrong as a `desktop` issue with
   the build number from **Compass → About**.
3. Issues are triaged by label only: `desktop` plus `bug` goes to the front of
   the milestone; `desktop` plus `enhancement` goes behind the open WPs.
4. Anything that needs a product decision gets `agent-loop-needs-human` and a
   one-paragraph question on the issue. Tyler answers on the issue.

## Nov 1 launch checklist

- [ ] `desktop-v1.0.0` tagged from `main` no later than Oct 30, notarized,
      `spctl --assess` green, and installed from the DMG on a clean Mac.
- [ ] Auto-update from the last internal tag to 1.0.0 verified.
- [ ] Production carries every web-side desktop change (WP-02, 04, 05, 06,
      07, 08, 10).
- [ ] Download page on compasscalendar.com links the DMG and states macOS 13+.
- [ ] `docs/acceptance/desktop.md` fully green on 1.0.0.
- [ ] PostHog shows `platform: desktop` events from Tyler's build.
- [ ] Email drafted, download link tested from the email itself.

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
