import { loadCompassConfig } from "@core/config/compass.config";
import { copyStaticAssets } from "./copy-static-assets";
import { postcssPlugin } from "./plugins/postcss.plugin";
import { watch } from "node:fs";
import path from "node:path";

const config = loadCompassConfig();

const WEB_PORT = Number(config.web?.port) || 9080;
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

// SSE clients waiting for reload signals (dev mode only)
const reloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function notifyReload() {
  const msg = new TextEncoder().encode("data: reload\n\n");
  for (const ctrl of reloadClients) {
    try {
      ctrl.enqueue(msg);
    } catch {
      reloadClients.delete(ctrl);
    }
  }
}

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
    console.error("[build] failed:");
    for (const message of result.logs) console.error(message);
    return false;
  }

  await copyStaticAssets(OUTDIR);

  return true;
}
// biome-ignore lint/suspicious/noConsole: Preserve dev-server progress output.
console.log("[compass] building...");
await build();
// biome-ignore lint/suspicious/noConsole: Preserve dev-server progress output.
console.log(`[compass] dev server → http://localhost:${WEB_PORT}`);

if (IS_DEV) {
  // Watch src/ and rebuild on changes (debounced) — dev mode only
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  watch(SRCDIR, { recursive: true }, (_event, filename) => {
    if (!filename || filename.includes(".test.")) return;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(async () => {
      // biome-ignore lint/suspicious/noConsole: Preserve dev-server rebuild output.
      console.log(`[rebuild] ${filename}`);
      const ok = await build();
      if (ok) notifyReload();
    }, 80);
  });
}

// Live reload script injected into HTML responses (dev mode only)
const LIVE_RELOAD_SCRIPT = IS_DEV
  ? `<script>
  new EventSource('/__live-reload').onmessage = () => location.reload();
</script>`
  : "";

Bun.serve({
  port: WEB_PORT,
  // Prevent Bun from closing long-lived SSE connections prematurely.
  // Default is 10 s which produces "[Bun.serve]: request timed out" noise in CI.
  idleTimeout: IS_DEV ? 255 : 0,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // SSE endpoint for live reload (dev mode only)
    if (IS_DEV && pathname === "/__live-reload") {
      let ctrl!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          ctrl = c;
          reloadClients.add(ctrl);
        },
        cancel() {
          reloadClients.delete(ctrl);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Try to serve a file from the build output
    const filePath = path.join(
      OUTDIR,
      pathname === "/" ? "index.html" : pathname,
    );
    const file = Bun.file(filePath);

    if (await file.exists()) {
      if (filePath.endsWith(".html")) {
        const html = (await file.text()).replace(
          "</body>",
          `${LIVE_RELOAD_SCRIPT}</body>`,
        );
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response(file);
    }

    // SPA fallback — return index.html for client-side routes
    const index = Bun.file(path.join(OUTDIR, "index.html"));
    const html = (await index.text()).replace(
      "</body>",
      `${LIVE_RELOAD_SCRIPT}</body>`,
    );
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  },
});
