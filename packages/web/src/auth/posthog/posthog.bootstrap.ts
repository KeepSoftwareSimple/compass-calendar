import { type PostHog } from "posthog-js";
import { isPosthogEnabled } from "@web/auth/posthog/posthog.util";
import { filterPosthogBookingTelemetry } from "@web/auth/posthog/posthog-booking-filter.util";
import { filterPosthogDeadClick } from "@web/auth/posthog/posthog-dead-click-filter.util";
import { filterPosthogBeforeSend } from "@web/auth/posthog/posthog-exception-filter.util";
import { filterPosthogWebVitals } from "@web/auth/posthog/posthog-web-vitals-filter.util";
import { ENV_WEB } from "@web/common/constants/env.constants";

let client: PostHog | undefined;

/**
 * Initialize PostHog once, outside the React tree.
 *
 * `index.tsx` calls this before `root.render`, so PostHog's
 * `capture_unhandled_errors`/`capture_unhandled_rejections` handlers are
 * installed before IndexedDB and `sessionInit()` are awaited. A throw during
 * boot - the exact shape that left session 019fb57e blank with zero telemetry -
 * is then captured instead of vanishing. The React provider reads this client
 * after boot rather than owning a second initialization path.
 */
export function initPosthog(): PostHog | undefined {
  if (!isPosthogEnabled()) return undefined;
  if (client) return client;

  const posthog = require("posthog-js").posthog as PostHog;
  posthog.init(ENV_WEB.POSTHOG_KEY as string, {
    api_host: ENV_WEB.POSTHOG_HOST!,
    // Assumes the US cloud; self-hosters on another instance would differ.
    ui_host: "https://us.posthog.com",
    // Captured errors land on the event as `$exception_list[]` (type, value,
    // stacktrace.frames) plus the flattened `$exception_types` /
    // `$exception_values` arrays. The legacy `$exception_type` /
    // `$exception_message` scalars are never sent by this SDK line, so a
    // query on them reads null for every event and looks like a broken
    // integration when nothing is wrong.
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      // Off on purpose: the app deliberately console.error's errors it
      // has already handled (a network blip during a session check, a
      // retryable 502 from a provider), so capturing console.error as an
      // exception turns every expected transient failure into a fresh
      // error-tracking issue. Genuinely uncaught errors/rejections are
      // still captured by the two handlers above.
      capture_console_errors: false,
    },
    // Drop known-unactionable exception signatures (SuperTokens/browser
    // network blips, CefSharp scanner noise, opaque "Script error.") before
    // they become issues, then the dead clicks posthog's own mutation clock
    // mis-scores on our static onboarding overlays, then the web vitals that
    // report a zero where a timing should be, then booking URL/token/PII
    // redaction (and dropping replay/autocapture/exceptions on /meet).
    before_send: [
      filterPosthogBeforeSend,
      filterPosthogDeadClick,
      filterPosthogWebVitals,
      filterPosthogBookingTelemetry,
    ],
    // Inputs on public /meet pages include guest name, email, and notes.
    // Replay DOM/network metadata cannot be rewritten onto the booking
    // allowlist; before_send drops those captures on public booking routes.
    session_recording: {
      maskAllInputs: true,
    },
    // Web vitals were running entirely on PostHog's server-side default
    // (`$web_vitals_enabled_server_side` was true on every event, and
    // `$web_vitals_allowed_metrics` was null, so the project was not
    // restricting metrics). Stating it here instead means the setting is
    // reviewable in the diff and cannot be changed out from under a deploy by
    // a remote-config edit - client config wins over remote config in
    // posthog-js's `allowedMetrics` resolution.
    capture_performance: {
      web_vitals: true,
      web_vitals_allowed_metrics: ["LCP", "CLS", "FCP", "INP"],
      // posthog-js buffers metrics and flushes on exactly three triggers: a URL
      // change, the buffer reaching `web_vitals_allowed_metrics.length`, or
      // this timer. There is deliberately no pagehide flush, so anything still
      // buffered when the page unloads is simply lost. LCP and INP are only
      // reported by the web-vitals library on first interaction or page hide,
      // which is why they miss far more often than FCP.
      //
      // Shortening the window from posthog's 5000ms default does not rescue a
      // metric that arrives during unload - nothing can, short of a pagehide
      // flush upstream - but it does shrink the window in which an already
      // complete measurement sits unsent, which is where short visits lose
      // theirs. The cost is up to four `$web_vitals` events per pageview
      // instead of two, which is noise at this traffic volume.
      web_vitals_delayed_flush_ms: 1000,
    },
    // Product events are queued and sent in batches by the SDK. Keyboard
    // handlers only enqueue meaningful outcomes and never wait on transport.
    request_batching: true,
    opt_in_site_apps: true,
    person_profiles: "always",
  });
  // Staging and production share this PostHog project with the same key, so
  // without this, staging traffic is indistinguishable from production in
  // every insight (env.constants.ts NODE_ENV mirrors sync/backend's
  // `environment` property for the same reason).
  posthog.register({ environment: ENV_WEB.NODE_ENV });

  client = posthog;
  return client;
}

/**
 * The initialized PostHog instance, or undefined when PostHog is disabled or
 * has not been initialized yet. Non-React callers (e.g. the error boundary)
 * use this to report without a hook.
 */
export function getPosthogClient(): PostHog | undefined {
  return client;
}
