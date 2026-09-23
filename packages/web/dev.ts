import { loadCompassConfig } from "@core/config/compass.config";
import { copyStaticAssets } from "./copy-static-assets";
import { isGuestMeetStaticPath } from "./guest-meet-static-path";
import { postcssPlugin } from "./plugins/postcss.plugin";
import { startStaticDevServer } from "./static-dev-server";
import path from "node:path";

const config = loadCompassConfig();

const WEB_PORT = Number(config.web?.port) || 9080;
const BOOKING_WEB_PORT = Number(process.env.BOOKING_WEB_PORT) || 9081;
const BOOKING_WEB_ORIGIN = `http://localhost:${BOOKING_WEB_PORT}`;
const OUTDIR = path.resolve(import.meta.dir, "../../build/web");
const SRCDIR = path.resolve(import.meta.dir, "src");

// In development: unminified + inline sourcemaps + live-reload watcher.
// In test/other: minified + no sourcemaps + no live-reload (keeps bundle small
// so Playwright tests can parse it quickly on CI's limited CPU).
const IS_DEV = (config.runtime.nodeEnv ?? "development") === "development";

// Define process.env as a whole object so both dot and bracket notation work:
// process.env.NODE_ENV and process.env["NODE_ENV"] are both replaced correctly.
const define: Record<string, string> = {
  "process.env": JSON.stringify({
    NODE_ENV: config.runtime.nodeEnv || "development",
    API_BASEURL: config.backend.apiUrl,
    GOOGLE_CLIENT_ID: config.google?.clientId || "",
    MICROSOFT_CLIENT_ID:
      process.env.MICROSOFT_CLIENT_ID || config.microsoft?.clientId || "",
    APPLE_SERVICES_ID:
      process.env.APPLE_SERVICES_ID || config.apple?.signIn?.servicesId || "",
    POSTHOG_KEY: config.posthog?.key || "",
    POSTHOG_HOST: config.posthog?.host || "",
    PORT: String(config.backend.port ?? 3000),
  }),
  BUILD_VERSION: JSON.stringify("dev"),
};

async function build() {
  const result = await Bun.build({
    entrypoints: [path.resolve(import.meta.dir, "src/index.tsx")],
    outdir: OUTDIR,
    target: "browser",
    // Dev: inline sourcemaps for easy debugging; non-dev (e.g. test): strip them
    // entirely so the bundle stays ~3.5 MB instead of ~25 MB. CI Playwright
    // tests run a fresh Chromium per test; shaving 20+ seconds off V8 parse
    // time is the difference between passing and hitting the 30 s timeout.
    sourcemap: IS_DEV ? "inline" : "none",
    minify: !IS_DEV,
    splitting: true,
    define,
    plugins: [postcssPlugin],
    publicPath: "/",
  });

  if (!result.success) {
    console.error("[compass] build failed:");
    for (const message of result.logs) console.error(message);
    return false;
  }

  await copyStaticAssets(OUTDIR);

  return true;
}

await startStaticDevServer({
  label: "compass",
  port: WEB_PORT,
  outdir: OUTDIR,
  srcdir: SRCDIR,
  isDev: IS_DEV,
  build,
  // Guest /meet lives in booking-web now; hand those paths over rather than
  // serving calendar-web's SPA fallback for them.
  handleRequest: (url) =>
    isGuestMeetStaticPath(url.pathname)
      ? Response.redirect(
          `${BOOKING_WEB_ORIGIN}${url.pathname}${url.search}`,
          307,
        )
      : undefined,
});
