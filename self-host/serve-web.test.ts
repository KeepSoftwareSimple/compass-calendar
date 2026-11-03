import { isCalendarSpaPath } from "../apps/calendar-web/spa-route-path";
import { ROOT_ROUTES } from "../apps/calendar-web/src/common/constants/routes";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

let buildRoot: string;
let server: ServeWeb;
let baseUrl: string;

const INDEX_JS = "console.log('hello from compass');".repeat(20);

// serve-web.ts prints this once Bun.serve has bound. WEB_PORT=0 asks the OS
// for a free port, so the line is also how we learn which port to hit; the
// trailing newline guards against parsing a port split across stdout chunks.
const READY_LINE =
  /Compass web server listening on http:\/\/0\.0\.0\.0:(\d+)\n/;
// Safety net only: readiness is the ready line, not this timer. It exists so
// a child that hangs before printing still fails instead of stalling the run.
const READY_DEADLINE_MS = 30_000;

type ServeWeb = {
  baseUrl: string;
  process: Bun.Subprocess<"ignore", "pipe", "pipe">;
};

async function startServeWeb(
  env: Record<string, string> = {},
): Promise<ServeWeb> {
  const child = Bun.spawn(["bun", join(import.meta.dir, "serve-web.ts")], {
    env: { ...process.env, WEB_PORT: "0", WEB_ROOT: buildRoot, ...env },
    stderr: "pipe",
    stdout: "pipe",
  });

  try {
    const port = await readReadyPort(child);
    return { baseUrl: `http://localhost:${port}`, process: child };
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function readReadyPort(
  child: Bun.Subprocess<"ignore", "pipe", "pipe">,
): Promise<number> {
  const decoder = new TextDecoder();
  let stdout = "";
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const ready = (async () => {
    for await (const chunk of child.stdout) {
      stdout += decoder.decode(chunk, { stream: true });
      const match = READY_LINE.exec(stdout);
      if (match) {
        return Number(match[1]);
      }
    }
    // stdout only closes when the child exits, so this is the crash path.
    const code = await child.exited;
    const stderr = await new Response(child.stderr).text();
    throw new Error(
      `serve-web exited with code ${code} before printing its ready line.\nstderr:\n${stderr}stdout:\n${stdout}`,
    );
  })();
  const timedOut = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => {
      reject(
        new Error(
          `serve-web printed no ready line within ${READY_DEADLINE_MS}ms.\nstdout:\n${stdout}`,
        ),
      );
    }, READY_DEADLINE_MS);
  });
  // The losing racer still settles later (the child is killed in teardown);
  // mark both handled so bun:test does not report a stray unhandled rejection.
  for (const racer of [ready, timedOut]) {
    racer.catch(() => {});
  }

  try {
    return await Promise.race([ready, timedOut]);
  } finally {
    clearTimeout(deadline);
  }
}

beforeEach(async () => {
  buildRoot = mkdtempSync(join(tmpdir(), "serve-web-test-"));

  writeFileSync(
    join(buildRoot, "index.html"),
    "<!doctype html><html><body>compass</body></html>",
  );
  writeFileSync(join(buildRoot, "index.js"), INDEX_JS);
  writeFileSync(
    join(buildRoot, "index.js.br"),
    brotliCompressSync(Buffer.from(INDEX_JS)),
  );
  writeFileSync(
    join(buildRoot, "index.js.gz"),
    gzipSync(Buffer.from(INDEX_JS)),
  );
  writeFileSync(join(buildRoot, "favicon.ico"), Buffer.from([0, 1, 2, 3]));

  server = await startServeWeb();
  baseUrl = server.baseUrl;
});

afterEach(() => {
  server.process.kill();
  rmSync(buildRoot, { force: true, recursive: true });
});

describe("serve-web security headers", () => {
  it("sends baseline hardening headers on static responses", async () => {
    const response = await fetch(`${baseUrl}/index.html`);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});

describe("serve-web accept-encoding negotiation", () => {
  it("serves the brotli sibling and marks it with Content-Encoding + Vary", async () => {
    const response = await fetch(`${baseUrl}/index.js`, {
      headers: { "Accept-Encoding": "gzip, br" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");

    // fetch() transparently decodes Content-Encoding, so the body already
    // round-trips through brotli by the time it reaches us; the header
    // assertion above is what proves the server picked the brotli sibling.
    expect(await response.text()).toBe(INDEX_JS);
  });

  it("falls back to gzip when the client only accepts gzip", async () => {
    const response = await fetch(`${baseUrl}/index.js`, {
      headers: { "Accept-Encoding": "gzip" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(await response.text()).toBe(INDEX_JS);
  });

  it("serves identity when no compressed sibling matches", async () => {
    const response = await fetch(`${baseUrl}/index.js`, {
      headers: { "Accept-Encoding": "identity" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(await response.text()).toBe(INDEX_JS);
  });

  it("serves identity for a file with no precompressed sibling", async () => {
    const response = await fetch(`${baseUrl}/index.html`, {
      headers: { "Accept-Encoding": "br" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBeNull();
  });

  it("never serves a .br or .gz sibling as the URL itself", async () => {
    const brResponse = await fetch(`${baseUrl}/index.js.br`);
    const gzResponse = await fetch(`${baseUrl}/index.js.gz`);

    expect(brResponse.status).toBe(404);
    expect(gzResponse.status).toBe(404);
  });
});

describe("serve-web 304 behavior", () => {
  it("still returns 304 on a matching ETag, unaffected by encoding negotiation", async () => {
    const first = await fetch(`${baseUrl}/index.js`, {
      headers: { "Accept-Encoding": "br" },
    });
    const etag = first.headers.get("etag");
    expect(etag).not.toBeNull();

    const second = await fetch(`${baseUrl}/index.js`, {
      headers: { "Accept-Encoding": "br", "If-None-Match": etag ?? "" },
    });

    expect(second.status).toBe(304);
  });
});

describe("serve-web guest /meet cutover", () => {
  it("does not SPA-fallback guest booking paths onto calendar-web", async () => {
    const response = await fetch(`${baseUrl}/meet/hostuser`, {
      headers: { "Accept-Encoding": "br" },
    });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("compass");
  });

  it("SPA-fallbacks guest booking paths when serving booking-web", async () => {
    const bookingServer = await startServeWeb({
      WEB_SERVES_GUEST_MEET: "true",
    });

    try {
      const response = await fetch(`${bookingServer.baseUrl}/meet/hostuser`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("compass");
    } finally {
      bookingServer.process.kill();
    }
  });

  it("serves meet-landing.html for bare /meet when serving booking-web", async () => {
    writeFileSync(
      join(buildRoot, "meet-landing.html"),
      '<!doctype html><html><head><link rel="canonical" href="https://www.compasscalendar.com/meet" /></head><body>A simple booking page for your calendar</body></html>',
    );
    const bookingServer = await startServeWeb({
      WEB_SERVES_GUEST_MEET: "true",
    });

    try {
      const response = await fetch(`${bookingServer.baseUrl}/meet`);

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('rel="canonical"');
      expect(html).toContain("https://www.compasscalendar.com/meet");
      expect(html).toContain("A simple booking page for your calendar");
    } finally {
      bookingServer.process.kill();
    }
  });
});

describe("serve-web path traversal", () => {
  it("blocks a traversal attempt from escaping the build root", async () => {
    const response = await fetch(`${baseUrl}/..%2f..%2f..%2fetc%2fpasswd`, {
      headers: { "Accept-Encoding": "br" },
    });

    // No extension on the sanitized path, so it falls through to the SPA
    // index (as an unknown path, 404) rather than leaking anything outside
    // buildRoot.
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("compass");
    expect(body).not.toContain("root:");
  });
});

describe("serve-web unknown paths", () => {
  it("serves real calendar routes with 200", async () => {
    for (const route of [
      "/",
      "/week",
      "/week/2026-11-02",
      "/day",
      "/day/2026-11-03",
      "/life",
      "/shortcuts",
      "/auth/google/callback",
      "/billing/desktop-return",
    ]) {
      const response = await fetch(`${baseUrl}${route}`);
      expect({ route, status: response.status }).toEqual({
        route,
        status: 200,
      });
    }
  });

  it("answers unknown paths with 404 and still sends the app shell", async () => {
    const response = await fetch(`${baseUrl}/this-page-does-not-exist`);

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.text()).toContain("<html>");
  });

  it("never answers an unknown path with an empty 304", async () => {
    const first = await fetch(`${baseUrl}/`);
    const etag = first.headers.get("etag") ?? "";
    await first.text();

    const response = await fetch(`${baseUrl}/nope`, {
      headers: { "If-None-Match": etag },
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<html>");
  });

  it("keeps the booking-web SPA fallback at 200", async () => {
    const bookingServer = await startServeWeb({
      WEB_SERVES_GUEST_MEET: "true",
    });

    try {
      const response = await fetch(`${bookingServer.baseUrl}/anything`);
      expect(response.status).toBe(200);
    } finally {
      bookingServer.process.kill();
    }
  });

  it("covers every route the calendar router declares", () => {
    for (const route of Object.values(ROOT_ROUTES)) {
      if (route === ROOT_ROUTES.API) {
        continue;
      }
      const concrete = route.replace(/\$[A-Za-z]+/g, "x");
      expect({ route, known: isCalendarSpaPath(concrete) }).toEqual({
        route,
        known: true,
      });
    }
    expect(isCalendarSpaPath("/week/")).toBe(true);
    expect(isCalendarSpaPath("/privacy-old")).toBe(false);
    expect(isCalendarSpaPath("/week/2026/extra")).toBe(false);
  });
});
