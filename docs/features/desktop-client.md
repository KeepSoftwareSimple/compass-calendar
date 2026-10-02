# Compass Desktop (macOS)

**Status:** Native rewrite planned 2026-10-01. Work is tracked on GitHub: the
[Compass Desktop board](https://github.com/orgs/KeepSoftwareSimple/projects/9)
[milestone Desktop native v1](https://github.com/KeepSoftwareSimple/compass-calendar/milestone/45),
and the tracking issue
[#4215](https://github.com/KeepSoftwareSimple/compass-calendar/issues/4215),
which holds status, owner confirmations, and QA notes. This doc holds the
decisions and the reference material only.

**Owner:** Tyler (credentials, production deploys, QA). Agents build the rest
through the agent loop.

## Goal

The best native calendar app on the Mac: a Swift app with a native window,
sidebar, header, time grid, event form, command palette, and shortcuts
legend, talking to the Compass backend directly over HTTP and server-sent
events. Plus the things only a Mac app can do: menu bar agenda, Dock badge,
notifications that fire with the window closed, a global quick-add hotkey,
native menus, deep links, launch at login, and silent auto-updates.

macOS only. Windows and Linux are out of scope and may never ship.

## History

Desktop v1 (milestone 44, September 2026) shipped a Swift shell that hosted
the web app in a WKWebView. It proved the native services (notifications,
agenda, hotkey, deep links, Sparkle, signing, release pipeline) and it
proved the shell approach was not good enough: the web header fought the
traffic lights, and every chrome detail was a web page pretending to be a
window. The shell never launched publicly. It stays an internal dogfood
build until the native app passes acceptance, then it is deleted.

## Decisions

Each of these is a judgment call. Tyler can veto any of them on the tracking
issue. After that they are settled; the loop treats the tracking issue's
Locked decisions and Deferred sections as binding.

1. **Fully native Swift. The WKWebView shell is replaced, not wrapped.**
   Not Electron, not a hybrid with web sheets. The calendar surface, forms,
   palette, legend, settings, billing, onboarding, and Life view are all
   Swift. One named wart: the card-entry step of billing stays on Stripe's
   hosted Checkout page because Stripe has no native macOS checkout;
   everything around it is native.
2. **Keyboard-only, like the web.** The mouse is inert for editing and
   navigation. Clicking the grid shows the shortcut hint for that intent and
   does nothing else. Right-click opens the event menu, the one mouse
   affordance the web keeps. No drag, no resize, no click-to-create.
3. **Minimum macOS 14 Sonoma.** Universal binary. Swift 6 with strict
   concurrency. The Observation framework and modern SwiftUI are the floor.
4. **One app, `apps/calendar-macos`, three local SwiftPM packages.**
   `CompassKit` (pure Swift, Foundation only: generated contracts, keyboard
   engine, calendar math, deck layout, recurrence, HTML fragment, SSE
   parser), `CompassData` (URLSession client, Keychain session, bearer
   interceptor, SSE stream, GRDB cache, repositories, `@Observable` stores),
   and `CompassUI` (SwiftUI chrome and forms, an AppKit time grid). The app
   target stays AppKit for the window, menus, status item, panels, hotkey,
   notifications, and deep-link routing. XcodeGen `project.yml`, no
   checked-in `.xcodeproj`.
5. **Swift never hand-copies a contract.** `bun cli contracts:swift` emits
   Codable types from a manifest of `packages/core` Zod schemas, and
   `bun cli desktop:export` emits the shortcut registry, theme tokens,
   product event names, and parity fixtures from the TypeScript
   implementations. Both have `--check` modes that run on Linux CI, so drift
   fails before a Mac build runs. Swift parity tests replay the fixtures.
6. **Header sessions, same backend.** SuperTokens accepts
   `Authorization: Bearer` once a client signs in with `st-auth-mode:
   header`; `/api/events/stream` runs the same `verifySession()`. The native
   client uses that. No new backend service, no cookie jar, no CORS origin.
7. **OAuth through `ASWebAuthenticationSession` and the existing relay.**
   Google refuses sign-in inside embedded web views; the system
   authentication session is allowed. The native app builds the desktop
   `state` marker, opens the provider URL, the existing web callback page
   redirects to `compass://auth/<provider>/callback?...`, and the native
   app finishes the exchange with `POST /api/signinup`. No new OAuth
   clients, no new redirect URIs. Apple keeps the web form-post path through
   the same session.
8. **GRDB (SQLite) for the local cache.** Generated Codable structs fit
   `FetchableRecord` directly, GRDB 7 is Sendable-clean under Swift 6, FTS5
   gives palette event search, and migrations are reviewable diffs.
   SwiftData's `@Model` classes and `ModelActor` story on macOS 14 are
   fragile for this shape of data.
9. **Theme stays explicit.** `light-beach` and `dark-abyss` are chosen in
   the app, not followed from the system appearance, for parity with the
   web. Tokens come from `apps/calendar-web/src/index.css` via the export.
10. **Distribution is unchanged.** Signed, notarized, universal DMG on
    GitHub Releases under `macos-v*` tags with a Sparkle appcast. No Mac
    App Store, no Homebrew cask for v1.
    Owner QA runs an unsigned **dev channel** (`release-macos-dev.yml`):
    every merge that touches the app publishes an ad-hoc signed build to the
    rolling `macos-dev` prerelease, and builds stamped
    `COMPASS_UPDATE_CHANNEL=dev` follow that feed, so a laptop stays current
    without tags. It needs only the Sparkle keys, not Apple enrollment.
    Install one dev DMG by hand once (right-click, Open); after that it
    updates itself. The native app keeps this channel from its first
    skeleton build, so weekly founder acceptance never waits on a tag.
11. **Every build and test runs on GitHub's macOS runners.** Agents in the
    loop cannot compile AppKit. Pure packages run `swift test` without
    XcodeGen in a separate job; `CompassUI` and XCUITest go through
    `xcodebuild test`.
12. **Three loop partitions for Swift.** `desktop` (app target,
    `project.yml`, Resources, CompassUITests), `desktop-kit` (CompassKit,
    CompassData), `desktop-ui` (CompassUI). Issues sharing a partition never
    run together, so three Swift work packages can run at once.

## Architecture

```text
apps/calendar-macos/
  project.yml          XcodeGen; min macOS 14; three local packages; Swift 6 strict
  Compass/             AppKit app: AppDelegate, window, menus, status item, panels,
                       notifications, hotkey, DeepLinkRouter, PostHogCapture,
                       ASWebAuthenticationSession host
  CompassKit/          pure Swift. Generated/ (Contracts.swift, ShortcutIds.swift,
                       ThemeTokens.swift, ProductEvent.swift), Keyboard/, Calendar/,
                       Layout/, Recurrence/, HTMLFragment/, SSEParser.swift,
                       Resources/ (shortcuts.json, Fixtures/*.json)
  CompassData/         CompassAPIClient, KeychainSessionStore, AuthInterceptor,
                       ServerEventStream, AppDatabase (GRDB), repositories,
                       Stores/ (@Observable)
  CompassUI/           RootView, Sidebar, Header, TimeGridView (NSView), EventForm,
                       dialogs, CommandPalette, ShortcutsLegend, WhichKeyPanel,
                       Settings, Billing, Onboarding, BlockParty, LifeView (Canvas)
  CompassKitTests/     XCTest, no AppKit
  CompassUITests/      XCUITest: launch, demo-mode flows, deep link, menu dispatch
  Resources/           icon, entitlements, Info.plist values
```

### Per-surface choice

| Surface | Choice | Why |
| --- | --- | --- |
| Window, menus, status item, Dock, panels, hotkey | AppKit | Already native from Desktop v1. |
| Sidebar, header, month picker, forms, dialogs, settings, billing, onboarding, palette, legend, which-key, chips | SwiftUI as in-window overlays | One keyboard dispatcher owns every key; no NSWindow sheets fighting first responder. |
| Time grid (week and day) | `TimeGridView: NSView`, layer-backed, reused `EventCardView` per event, hosted by `NSViewRepresentable` | Hundreds of positioned cards, pixel-exact overlap deck, custom focus ring, accessibility identifiers for XCUITest. |
| Description editor | `NSTextView` behind a controlled HTML subset (p, strong, em, a, ul, ol, li, br) | Rich text with round-trip fidelity to the web's TipTap output. |
| Life view | SwiftUI `Canvas` | Thousands of cells drawn once per state change. |
| Quick-add panel | `NSPanel` hosting SwiftUI | Reuses the existing panel controller; drops the second WKWebView. |

### State

`@MainActor @Observable` stores mirror the web's Zustand stores one to one so
an agent ports by reading the TypeScript file: `ViewStore`, `EventsStore`
(range loads keyed like TanStack Query, optimistic create/replace/delete/rsvp
with no rollback and invalidate on settle, SSE hookup), `DraftStore`
(activities, nudges, quick-time), `FocusStore` (event registry, Tab edges,
page-jump targets), `UndoStore` (series undo refused), `ClipboardStore`,
`HiddenEventsStore`, `AuthStore`, `BillingStore`, `ConfigStore`,
`SettingsStore`, `LevelsStore`, `OnboardingStore`, `NotificationsStore`.

### Keyboard

One `NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .flagsChanged])`
feeds `ShortcutDispatcher` in CompassKit. It holds a scope stack
(`modal > form > grid > global`), gates bare letters when a text field is
first responder, runs the `e` leader state machine (armed with a timeout,
drives the which-key panel), and a hold-modifier detector (Mod held shows
page-jump chips, hold-H shows event-jump chips). Bindings come only from the
generated `shortcuts.json`; a test asserts that the set of handler ids equals
the registry ids. Rules: `docs/frontend/shortcut-commandments.md`.

### Data

GRDB tables mirror the web's query keys: `event`, `calendar`,
`hidden_event`, `loaded_range(source, start, end, fetchedAt)`,
`user_metadata`, `local_event` (anonymous mode), `event_fts`. SSE messages
map to invalidations with the same table the web uses in
`apps/calendar-web/src/sse/client/sse.client.ts`. The stream honors the
server's `retry:` hint and the 20-minute stream lifetime.

### Contract sharing

- `packages/core/src/desktop/swift-contracts.manifest.ts` lists the Zod
  schemas to export.
- `bun cli contracts:swift [--check]`: `z.toJSONSchema` then a small emitter
  for the subset Compass uses (object to `struct: Codable, Hashable,
  Sendable`; string enum to `enum: String`; discriminated `anyOf` to an enum
  with a custom `init(from:)`; branded ids to `RawRepresentable` structs).
  Unknown constructs fail with the schema path so a new Zod feature forces
  an emitter update instead of a silent `Any`.
- `bun cli desktop:export [--check]`: `shortcuts.json` and
  `ShortcutIds.swift` from the registry data in `packages/core/src/shortcuts`,
  `ThemeTokens.swift` from `index.css`, `ProductEvent.swift` from the
  analytics event union, and fixtures produced by running the TypeScript
  implementations: timed deck layout, event positions, nudges, rrule
  expansion and summaries, go-to-date parsing, HTML fragments, booking
  slots, Block Party tasks, and the demo seed.

### Backend and web changes

| Area | Change |
| --- | --- |
| Header sessions and SSE | No code expected. One backend integration test proves sign-in with `st-auth-mode: header`, Bearer profile, refresh rotation, SSE with Bearer, and sign-out. |
| OAuth | Reuse the relay page. Native Sign in with Apple is deferred. |
| Stripe | `returnTo: "desktop"` on checkout and payment-method sessions; success and cancel URLs land on a web route that redirects to `compass://billing/checkout?outcome=...`. |
| PostHog | Plain HTTP capture from Swift with `platform: desktop` and the same distinct id after sign-in; the key and host are served by `/api/config` if they are web-build-time only today. |
| Cutover | Delete `apps/calendar-web/src/desktop/*`, the bridge contracts, desktop settings sections, and the desktop notification port. Keep the OAuth relay and the billing return page. |

## Owner setup reference

The Desktop v1 secrets and credentials carry over unchanged: `APPLE_TEAM_ID`,
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`, `SPARKLE_PRIVATE_KEY`, the app icon. Two new items:

| # | What | Where | Time |
| --- | --- | --- | --- |
| 1 | Add milestone **Desktop native v1** to the front of repo var `AGENT_LOOP_MILESTONES`, replacing `Desktop v1`. | Repo variables | 2 min |
| 2 | Change the board's auto-add filter from `label:desktop` to the new milestone, since `desktop` is now one of three partition labels and most work packages do not carry it. | Project settings | 2 min |

Defaults that stay: app name **Compass**, bundle id
`com.compasscalendar.desktop`, URL scheme `compass://`, internal builds
default to production with a hidden staging switch, releases under
`macos-v*` tags.

## QA and acceptance

- `swift test` on CompassKit and CompassData replays the exported parity
  fixtures. The Linux `--check` steps fail when TypeScript changes without a
  re-export, so parity drift is caught before any Swift builds.
- Grid rendering is asserted through a `GridLayoutSnapshot` JSON dump
  (frames, labels, z-order) at fixed metrics, which agents can record
  without a Mac. Image snapshots are recorded by a `workflow_dispatch` job.
- XCUITest runs in anonymous demo mode on every PR, so it needs no server.
  Signed-in flows use a fixture transport in CompassData.
- No scheduled staging smoke. The header-session backend test and weekly
  founder acceptance on a real build cover the authenticated path.
- Visual checks, Notification Center behavior, OAuth per provider, Stripe
  test checkout, and Sparkle updates are manual: use
  [Desktop acceptance](../acceptance/desktop.md) on a signed build and
  record results on the tracking issue with the build number from About.

## Later, explicitly not v1

- Mouse editing of any kind: drag, resize, click-to-create, multi-select.
- iOS, iPadOS, Catalyst.
- EventKit integration for local macOS calendars (iCloud works over CalDAV).
- WidgetKit, Shortcuts.app intents, Spotlight indexing.
- Mac App Store, sandboxing, Homebrew cask.
- Multiple windows, tabs, Handoff, iCloud sync of device preferences.
- Native Sign in with Apple through `AuthenticationServices`.
- Bundled offline web assets. The shell is deleted, not kept as a fallback.
- An offline write queue for signed-in users (the web has none either).
- System-following appearance.
- Windows and Linux builds.

## Risks

| Risk | Mitigation |
| --- | --- |
| SwiftUI focus and AppKit first responder fight over Enter and Escape | One dispatcher, overlays rendered in-window, a text-input gating table with tests. |
| Rich text fidelity between TipTap HTML and `NSAttributedString` | Constrained subset with round-trip fixtures; untouched HTML outside the subset is preserved verbatim. |
| SuperTokens overrides assume cookies somewhere | The header-session test is a week-one work package. |
| Apple sign-in through the relay misbehaves | Verified in the OAuth work package before release notes rely on it. |
| macOS CI minutes with three Swift lanes | `swift test` split off from `xcodebuild`, path filtering, SwiftPM and DerivedData caches. This is a budget line Tyler owns. |
| Generator rigidity blocks a TypeScript change | By design; the emitter lives in `packages/scripts` so the same agent extends it in the same PR. |
| Parity drifts after cutover | The export checks stay in CI forever; a web shortcut or token change without a re-export is a red build. |
