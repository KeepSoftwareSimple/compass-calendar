import { loadCompassConfig } from "@core/config/compass.config";
import { postcssPlugin } from "../../packages/web/plugins/postcss.plugin";
import { copyStaticAssets } from "./copy-static-assets";
import { watch } from "node:fs";
import path from "node:path";

const configFile = process.env.COMPASS_CONFIG_FILE;
const config = configFile ? loadCompassConfig(configFile) : loadCompassConfig();

const WEB_PORT = Number(process.env.BOOKING_WEB_PORT) || 9081;
const OUTDIR = path.resolve(import.meta.dir, "../../build/booking-web");
const SRCDIR = path.resolve(import.meta.dir, "src");
const IS_DEV = (config.runtime.nodeEnv ?? "development") === "development";

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
    sourcemap: IS_DEV ? "inline" : "none",
    minify: !IS_DEV,
    splitting: true,
    define,
    plugins: [postcssPlugin],
    publicPath: "/",
  });

  if (!result.success) {
    console.error("[booking-web] build failed:");
    for (const message of result.logs) console.error(message);
    return false;
  }

  await copyStaticAssets(OUTDIR);
  return true;
}

console.log("[booking-web] building...");
await build();
console.log(`[booking-web] dev server → http://localhost:${WEB_PORT}`);

if (IS_DEV) {
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  watch(SRCDIR, { recursive: true }, (_event, filename) => {
    if (!filename || filename.includes(".test.")) return;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(async () => {
      console.log(`[booking-web rebuild] ${filename}`);
      const ok = await build();
      if (ok) notifyReload();
    }, 80);
  });
}

const LIVE_RELOAD_SCRIPT = IS_DEV
  ? `<script>
  new EventSource('/__live-reload').onmessage = () => location.reload();
</script>`
  : "";

Bun.serve({
  port: WEB_PORT,
  idleTimeout: IS_DEV ? 255 : 0,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

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
