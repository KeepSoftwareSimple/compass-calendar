import path from "node:path";

// Only the metafile fields used here. build.ts passes Bun.build's metafile
// (metafile: true), which lists every output's imports with their kind, so no
// parsing of the emitted sources is needed.
export interface BuildMetafile {
  outputs: Record<
    string,
    {
      imports: Array<{ path: string; kind: string }>;
      inputs?: Record<string, { bytesInOutput?: number } | unknown>;
      entryPoint?: string;
      bytes?: number;
    }
  >;
}

// Dynamic imports made from deeper chunks are normally the lazy route views
// and excluded from preloading, but some of them always execute on boot. Each
// source file listed here gets its containing chunk (plus that chunk's static
// closure) preloaded as well. AppRoot is the root route's component and
// RootShell the pathless calendar-shell route beneath it - both kept lazy
// imports only so route-shape tests can mock their auth stack (see
// router.routes.tsx) - and both render on every page load, 404s included.
// Not listed on purpose: views/Root.tsx and views/Week/WeekView.tsx. They
// also render on every calendar load, but preloading them measured slower,
// not faster (docs/development/week-initial-paint-audit.md, September 17
// 2026): a modulepreload is fetched and compiled on arrival, so under a
// throttled CPU the week view's closure competes with the boot code the
// first paint needs. Measure before adding a route chunk here.
// Metafile input keys are relative to the build's cwd, so entries here are
// matched by path suffix.
export const ALWAYS_BOOT_SOURCES = [
  "src/components/RootShell/AppRoot.tsx",
  "src/components/RootShell/RootShell.tsx",
];

export function parseBuildMetafile(
  metafile: string | object | undefined,
): BuildMetafile {
  if (!metafile) {
    throw new Error(
      "Bun.build returned no metafile; build.ts must pass metafile: true",
    );
  }
  return (
    typeof metafile === "string" ? JSON.parse(metafile) : metafile
  ) as BuildMetafile;
}

/**
 * Output keys of the boot set: the entry, its dynamic imports, and their
 * static-import closure first; then each ALWAYS_BOOT_SOURCES chunk with its
 * closure. Same walk injectModulePreloads uses; the returned list includes
 * the entry.
 *
 * Order matters because the browser fetches preloads in document order and
 * they all share the script priority: the entry's own graph must execute
 * before any route chunk can, so listing a route chunk's closure ahead of it
 * queues the first paint behind code it does not need yet. On a six-lane
 * HTTP/1.1 server (CI's Lighthouse, local runs) that queueing is worth
 * seconds; on HTTP/2 it still decides the send order.
 */
export function collectBootOutputKeys(
  metafile: string | object | undefined,
  alwaysBootSources: string[] = ALWAYS_BOOT_SOURCES,
): string[] {
  const meta = parseBuildMetafile(metafile);

  const entry = Object.keys(meta.outputs).find((key) => {
    const output = meta.outputs[key];
    return output?.entryPoint;
  });
  if (!entry) {
    throw new Error("No entrypoint output found in the build metafile");
  }

  const keys: string[] = [];
  const seen = new Set<string>();

  const walk = (root: string) => {
    if (seen.has(root)) return;
    seen.add(root);
    keys.push(root);
    const queue = [root];
    while (queue.length > 0) {
      const key = queue.shift() as string;
      const output = meta.outputs[key];
      if (!output) continue;
      for (const imp of output.imports) {
        const bootCritical =
          imp.kind === "import-statement" ||
          (key === entry && imp.kind === "dynamic-import");
        if (!bootCritical) continue;
        if (!imp.path.endsWith(".js") || seen.has(imp.path)) continue;
        if (!(imp.path in meta.outputs)) continue;
        seen.add(imp.path);
        keys.push(imp.path);
        queue.push(imp.path);
      }
    }
  };

  walk(entry);

  for (const source of alwaysBootSources) {
    const chunk = Object.keys(meta.outputs).find((key) =>
      Object.keys(meta.outputs[key]?.inputs ?? {}).some(
        (input) => input === source || input.endsWith(`/${source}`),
      ),
    );
    if (!chunk) {
      throw new Error(
        `Always-boot source ${source} is in no build output; update ALWAYS_BOOT_SOURCES in inject-module-preloads.ts`,
      );
    }
    walk(chunk);
  }

  if (keys.length < 2) {
    // With splitting enabled the entry always imports chunks; an empty walk
    // means the metafile shape changed or the wrong output was picked.
    throw new Error(`No boot-critical chunks found walking ${entry}`);
  }

  return keys;
}

/**
 * Injects `<link rel="modulepreload">` tags for every boot-critical chunk into
 * the built index.html, so the browser fetches the whole boot graph in
 * parallel instead of discovering it one import level (= one round-trip) at a
 * time: index.js -> its static chunks -> app.bootstrap -> ~25 more chunks.
 *
 * Boot-critical means the static-import closure of the entry plus the
 * static-import closure of the entry's own dynamic imports. index.js's lone
 * dynamic import (app.bootstrap) always executes on boot, so it counts; a
 * second dynamic import added to index.tsx would get preloaded on the same
 * assumption. Dynamic imports in deeper chunks are the lazy route views and
 * are deliberately NOT followed - except the chunks holding
 * ALWAYS_BOOT_SOURCES, which are lazy imports that still run on every boot.
 */
export async function injectModulePreloads(
  outdir: string,
  metafile: string | object | undefined,
  alwaysBootSources: string[] = ALWAYS_BOOT_SOURCES,
): Promise<string[]> {
  const keys = collectBootOutputKeys(metafile, alwaysBootSources);
  // Preload tags omit the entry: the page already loads it via <script type=module>.
  const names = keys.slice(1).map((key) => key.replace(/^\.\//, ""));

  const htmlPath = path.join(outdir, "index.html");
  const html = await Bun.file(htmlPath).text();
  const links = `${names
    .map((name) => `  <link rel="modulepreload" href="/${name}" />`)
    .join("\n")}\n`;
  let sawHead = false;
  const rewritten = new HTMLRewriter()
    .on("head", {
      element(el) {
        sawHead = true;
        el.append(links, { html: true });
      },
    })
    .transform(html);
  if (!sawHead) {
    throw new Error(`${htmlPath} has no <head> to inject preloads into`);
  }
  await Bun.write(htmlPath, rewritten);

  return names;
}
