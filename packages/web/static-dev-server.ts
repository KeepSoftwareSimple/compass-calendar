import { watch } from "node:fs";
import path from "node:path";

/**
 * The bundle-and-serve loop shared by the calendar-web and booking-web dev
 * servers: an initial build, a debounced rebuild watcher, an SSE live-reload
 * channel, static file serving out of the build directory, and an SPA
 * fallback to index.html.
 *
 * It lives beside calendar-web's build scripts rather than in a package of its
 * own because both apps already build with `packages/web/plugins`, and neither
 * ships this file: it runs only under `bun run dev.ts`.
 */
export interface StaticDevServerOptions {
  /** Prefix for progress output, e.g. "compass" -> "[compass] building...". */
  label: string;
  port: number;
  /** Build output directory served to the browser. */
  outdir: string;
  /** Source directory watched for rebuilds (dev mode only). */
  srcdir: string;
  /**
   * Dev mode adds the watcher, the SSE endpoint, and the injected reload
   * script. Non-dev (e.g. the Playwright run) serves the build as-is.
   */
  isDev: boolean;
  /** Rebuilds the bundle. Returns false when the build failed. */
  build: () => Promise<boolean>;
  /**
   * Runs before the static lookup so an app can claim a path itself
   * (calendar-web redirects guest /meet to booking-web). Returning undefined
   * falls through to the normal static and SPA handling.
   */
  handleRequest?: (url: URL) => Response | undefined;
}

export async function startStaticDevServer({
  label,
  port,
  outdir,
  srcdir,
  isDev,
  build,
  handleRequest,
}: StaticDevServerOptions) {
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

  // biome-ignore lint/suspicious/noConsole: Preserve dev-server progress output.
  console.log(`[${label}] building...`);
  await build();
  // biome-ignore lint/suspicious/noConsole: Preserve dev-server progress output.
  console.log(`[${label}] dev server → http://localhost:${port}`);

  if (isDev) {
    // Watch src/ and rebuild on changes (debounced) — dev mode only
    let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
    watch(srcdir, { recursive: true }, (_event, filename) => {
      if (!filename || filename.includes(".test.")) return;
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(async () => {
        // biome-ignore lint/suspicious/noConsole: Preserve dev-server rebuild output.
        console.log(`[${label} rebuild] ${filename}`);
        const ok = await build();
        if (ok) notifyReload();
      }, 80);
    });
  }

  // Live reload script injected into HTML responses (dev mode only)
  const liveReloadScript = isDev
    ? `<script>
  new EventSource('/__live-reload').onmessage = () => location.reload();
</script>`
    : "";

  async function serveHtml(file: Bun.BunFile) {
    const html = (await file.text()).replace(
      "</body>",
      `${liveReloadScript}</body>`,
    );
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  Bun.serve({
    port,
    // Prevent Bun from closing long-lived SSE connections prematurely.
    // Default is 10 s which produces "[Bun.serve]: request timed out" noise in CI.
    idleTimeout: isDev ? 255 : 0,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;

      // SSE endpoint for live reload (dev mode only)
      if (isDev && pathname === "/__live-reload") {
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

      const handled = handleRequest?.(url);
      if (handled) return handled;

      // Try to serve a file from the build output
      const filePath = path.join(
        outdir,
        pathname === "/" ? "index.html" : pathname,
      );
      const file = Bun.file(filePath);

      if (await file.exists()) {
        if (filePath.endsWith(".html")) return serveHtml(file);
        return new Response(file);
      }

      // SPA fallback — return index.html for client-side routes
      return serveHtml(Bun.file(path.join(outdir, "index.html")));
    },
  });
}
