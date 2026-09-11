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

## Silhouette shell (September 11, 2026)

The first shell was a padded page: a large "Compass Calendar" heading, a status
line, and a faded generic grid. It painted early but looked nothing like the
app, so the first impression was of a clunky skeleton and the swap to React
was a visible layout jump.

The shell is now a static silhouette of the week view built from the app's own
CSS tokens (`index.css` is render-blocking, so they are available): the 48px
header with arrows and the month heading, the day-label row, the all-day band,
the 13-visible-hour timed grid with its hour gutter and lines, the same 40px
spinner `EventGrid` shows during the first event load, and the sidebar. Two
inline scripts fill it in, both wrapped in `try` so a failure leaves a
seven-column, sidebar-open shell:

- The head script (already the theme script) reads `compass.theme`,
  `compass.view.sidebar-open`, `compass.sidebar.width` and `innerWidth`, and
  sets `data-theme`, `data-boot-sidebar`, `data-boot-cols`,
  `--boot-sidebar-width` and `--boot-cols` on `<html>`. These affect layout, so
  they are decided before first paint.
- The body script reads the clock and `/week/YYYY-MM-DD` and fills the heading,
  the day numbers and weekday labels, today's accent, past-day shading, the now
  line, the current hour label, the timezone corner, and pre-scrolls the grid
  so now sits 150px from the top, exactly where `useScroll` puts it.

`useScroll` now jumps to now in a layout effect instead of smooth-scrolling on
mount; with a pre-scrolled shell the glide read as a rewind. Manual
scroll-to-now (the "This Week" heading, `t`) is still smooth.

The numbers are mirrored by hand and each script comment lists its sources:
sidebar constants, the 1280px collapse breakpoint, the grid gutter and usable
column width, `computeVisibleDayCount`, `useWeek`'s anchor rule, `DayLabels`,
`getCalendarHeadingLabel`, `getColorsByHour` and `getScrollToNowTop`. Drift
makes the shell subtly off, never broken.

Known gaps: the first React commit removes the shell before the lazy `WeekView`
chunk mounts, leaving a background-colored gap (a candidate for
`ALWAYS_BOOT_SOURCES` in `inject-module-preloads.ts`, to be measured first);
first-time visitors see the full-contrast silhouette before the welcome modal's
scrim fades in; phones (which get `MobileGate`) and non-week routes briefly show
the week silhouette; and a pinned Compass timezone is ignored, so those users
can see the corner label, today, or the now line shift at the swap.

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
