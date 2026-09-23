import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

let buildRoot: string;
let server: ReturnType<typeof Bun.spawn>;
let baseUrl: string;

const INDEX_JS = "console.log('hello from compass');".repeat(20);

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(url);
      response.body?.cancel();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Server at ${url} never became ready`);
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

  const port = 20000 + Math.floor(Math.random() * 10000);
  baseUrl = `http://localhost:${port}`;

  server = Bun.spawn(["bun", join(import.meta.dir, "serve-web.ts")], {
    env: { ...process.env, WEB_PORT: String(port), WEB_ROOT: buildRoot },
    stderr: "pipe",
    stdout: "pipe",
  });

  await waitForServer(`${baseUrl}/index.html`);
});

afterEach(() => {
  server.kill();
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
});

describe("serve-web path traversal", () => {
  it("blocks a traversal attempt from escaping the build root", async () => {
    const response = await fetch(`${baseUrl}/..%2f..%2f..%2fetc%2fpasswd`, {
      headers: { "Accept-Encoding": "br" },
    });

    // No extension on the sanitized path, so it falls through to the SPA
    // index rather than leaking anything outside buildRoot.
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("compass");
  });
});
