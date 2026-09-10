# Week initial paint audit

Audited September 9, 2026 against commit `643c18d63` and the accompanying diff.

## Render path

Compass serves static HTML and uses React `createRoot`, not SSR or hydration.
Previously `index.html` contained an empty root. The entry initializes PostHog
when configured, dynamically imports `app.bootstrap.tsx`, opens the offline
IndexedDB store, initializes session handling, and finally renders React.
The router then resolves the lazy root, calendar shell, authenticated layout,
and Week components. The authenticated layout's `beforeLoad` also awaits
`session.doesSessionExist()`. Session handling independently checks auth in the
background. These are potential startup delays; event fetching is not the
page-wide blocker. Week's event query runs inside `Grid`, while the surrounding
header and sidebar can render independently.

The fix puts an accessible, theme-aware loading shell directly in the HTML.
It remains visible during JavaScript download and database initialization;
React replaces it at mount. This avoids introducing SSR infrastructure or
changing storage/auth ordering. It improves first content, not time to an
interactive calendar. The application stylesheet still blocks first paint.

## LCP and fonts

On a fresh desktop profile at 1440 × 900, Chromium's buffered
`largest-contentful-paint` observer identified the welcome modal paragraph:
“Rediscover the joy of shortcuts as you build your perfect schedule. No clicks
allowed.” Its reported area was 17,178 px². The calendar's large CSS grid is not
itself an LCP candidate, and there was no LCP image to resize or preload. A font
is a dependency of text rendering, not the LCP element itself. Other viewports,
returning users, and onboarding states can have different candidates.

Google Fonts' combined stylesheet was render-blocking even with `display=swap`:
that parameter governs font-file behavior, not the stylesheet download. The
stylesheet now loads with `media="print"`, switching to `all` on load, so the
welcome text can paint with its fallback font while font CSS is still pending.
The initial HTML shell explicitly uses a system font. Existing preconnects and
`display=swap` remain. A later font swap can still change text metrics.

See [Google's LCP guidance](https://web.dev/articles/optimize-lcp) and
[font optimization guidance](https://web.dev/learn/performance/optimize-web-fonts).

## Bundle audit

Production Bun builds enable `splitting: true`. Route components use dynamic
imports; the event form and booking settings also have lazy boundaries.
`inject-module-preloads.ts` preloads the startup import graph, including the
shared calendar shell, but does not recursively preload every route. The build
emits 80 boot modulepreload links. A fresh `/week` visit requested 102 JavaScript
resources totaling about 3.01 MB of decoded resource bodies in this fixture.
Shared providers, onboarding, auth, and calendar code remain substantial.

An experiment loading Settings only on first open saved approximately 19 KB
but added six requests and showed no meaningful LCP improvement. It was removed.
The final change does not reduce the JavaScript bundle. Further bundle work
should focus on measured shared dependencies rather than adding lazy boundaries
indiscriminately. Production analytics is another startup dependency; it was
disabled in this local fixture, so the results do not quantify its cost.

## Measurement

Built using `bun run build:web` with production runtime, local placeholder
backend configuration, and PostHog disabled. Served the production files locally
with SPA fallback. Used three fresh Chromium contexts per variant, desktop
1440 × 900, CDP network throttling at 10 Mbps down / 5 Mbps up and 80 ms latency,
and 4× CPU slowdown. No login flow or backend was exercised. Collected Paint
Timing and buffered LCP entries after eight seconds without interaction.

| Metric | Baseline | Final change |
| --- | --- | --- |
| FCP, three runs | 2.336, 2.128, 2.188 s | 0.332, 0.264, 0.268 s |
| LCP, three runs | 2.336, 2.248, 2.188 s | 2.364, 2.236, 2.332 s |
| JS decoded bytes | 3,011,871 | 3,011,871 |

FCP meets the 1.8-second target in this lab setup. LCP is essentially unchanged
when font CSS responds normally; the fix removes font CSS as a blocker when it
is slow. Local hosting does not reproduce production TTFB/CDN, geography,
analytics, or real-device performance, and these runs cannot establish the cause
of the reported 5–13-second field samples. Verify production p75 FCP/LCP after
release, split by new visitors, device, and navigation type. Do not interpret the
shell's FCP improvement as equivalent to faster interactive rendering.

`e2e/onboarding/initial-paint.spec.ts` holds both the entry script and Google
Font CSS pending, checks visible shell content and a real FCP entry, then lets
JavaScript resume and verifies the welcome dialog appears while font CSS remains
pending. It covers both stored themes and removal of the initial shell.

## Verification result

`bun run build:web` passed. `bun run verify --strict` completed with
`VERDICT: FAIL`: all 3,521 web unit tests, type checking, lint, and knip passed;
accessibility reported 35 passed / 19 failed, and the full end-to-end suite
reported 147 passed / 36 failed. Both new initial-paint tests passed in the full
suite as well as the focused production-build run.

Representative failures were reproduced using the unchanged original HTML and
the same test-build JavaScript on a separate local server: Settings booking
checks timed out waiting for Settings after `Control+Comma`, and the event-action
accessibility check timed out waiting for the event title input. These failures
also occur without this patch on this macOS environment. The entire failed set
was not rerun against baseline, so this is not a claim that every browser failure
has been classified. Full verification output: `/tmp/compass-week-verify.log`.
