import { COMPRESSIBLE_STATIC_TYPES } from "../packages/web/compressible-static-types";
import { type Stats } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORT = 9080;
const MAX_PORT = 65535;
const MIN_PORT = 1;

const port = parsePort(process.env.WEB_PORT);
const root =
  process.env.WEB_ROOT || path.resolve(import.meta.dir, "../build/web");
const textTypes: Record<string, string> = COMPRESSIBLE_STATIC_TYPES;

const STATIC_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
};

type ContentEncoding = "br" | "gzip";

const ENCODING_EXTENSIONS: Record<ContentEncoding, string> = {
  br: ".br",
  gzip: ".gz",
};

// build.ts's precompressBuildOutput() writes these next to compressible
// outputs. Parsed without q-value weighting since this server only ever
// picks the strongest of two candidates, not a ranked list.
function pickEncoding(acceptEncoding: string | null): ContentEncoding | null {
  if (!acceptEncoding) {
    return null;
  }

  const accepted = new Set(
    acceptEncoding
      .split(",")
      .map((part) => part.trim())
      .filter((part) => !/;\s*q=0(\.0+)?$/.test(part))
      .map((part) => part.split(";")[0]?.trim().toLowerCase()),
  );

  if (accepted.has("br")) {
    return "br";
  }
  if (accepted.has("gzip")) {
    return "gzip";
  }
  return null;
}

function badRequest(): Response {
  return new Response("Bad Request", { status: 400 });
}

function cacheControl(filePath: string): string {
  // Only Bun's split chunks (chunk-<hash>.js and their .js.map) are
  // content-hashed, so their URLs change with their content. Everything else
  // keeps a stable name across deploys while its content changes — including
  // index.js, index.css, and index.js.map — and must revalidate via the
  // ETag/Last-Modified sent below.
  return path.basename(filePath).startsWith("chunk-")
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

function contentType(filePath: string): string | undefined {
  return textTypes[path.extname(filePath)];
}

async function fileResponse(
  request: Request,
  filePath: string,
  resolvedRoot: string,
): Promise<Response | null> {
  let resolvedFilePath: string;
  let fileStat: Stats;

  try {
    resolvedFilePath = await realpath(filePath);

    if (!isInsideRoot(resolvedRoot, resolvedFilePath)) {
      return null;
    }

    fileStat = await stat(resolvedFilePath);

    if (!fileStat.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  const type = contentType(filePath);
  const etag = `"${fileStat.size.toString(16)}-${fileStat.mtimeMs.toString(16)}"`;
  const headers: Record<string, string> = {
    ...STATIC_SECURITY_HEADERS,
    ...(type ? { "Content-Type": type } : {}),
    "Cache-Control": cacheControl(resolvedFilePath),
    ETag: etag,
    "Last-Modified": fileStat.mtime.toUTCString(),
    Vary: "Accept-Encoding",
  };

  if (isNotModified(request, etag, fileStat.mtimeMs)) {
    return new Response(null, { status: 304, headers });
  }

  const encoding = pickEncoding(request.headers.get("accept-encoding"));
  const compressed = encoding
    ? await compressedSibling(resolvedFilePath, encoding)
    : null;

  if (compressed) {
    return new Response(Bun.file(compressed), {
      headers: { ...headers, "Content-Encoding": encoding },
    });
  }

  return new Response(Bun.file(resolvedFilePath), { headers });
}

async function compressedSibling(
  resolvedFilePath: string,
  encoding: ContentEncoding,
): Promise<string | null> {
  const siblingPath = `${resolvedFilePath}${ENCODING_EXTENSIONS[encoding]}`;

  try {
    const siblingStat = await stat(siblingPath);
    return siblingStat.isFile() ? siblingPath : null;
  } catch {
    return null;
  }
}

function isInsideRoot(resolvedRoot: string, resolvedPath: string): boolean {
  const relativePath = path.relative(resolvedRoot, resolvedPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function isNotModified(
  request: Request,
  etag: string,
  mtimeMs: number,
): boolean {
  const ifNoneMatch = request.headers.get("if-none-match");

  if (ifNoneMatch !== null) {
    return ifNoneMatch.trim().replace(/^W\//, "") === etag;
  }

  const ifModifiedSince = Date.parse(
    request.headers.get("if-modified-since") ?? "",
  );

  // HTTP dates carry whole seconds, so compare mtime at second precision.
  return (
    !Number.isNaN(ifModifiedSince) &&
    Math.floor(mtimeMs / 1000) * 1000 <= ifModifiedSince
  );
}

function parsePort(portValue: string | undefined): number {
  if (portValue === undefined) {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(portValue)) {
    return rejectPort(portValue);
  }

  const parsedPort = Number(portValue);

  if (
    !Number.isSafeInteger(parsedPort) ||
    parsedPort < MIN_PORT ||
    parsedPort > MAX_PORT
  ) {
    return rejectPort(portValue);
  }

  return parsedPort;
}

function rejectPort(portValue: string): never {
  console.error(
    `Invalid WEB_PORT "${portValue}". Expected an integer from 1 to 65535.`,
  );
  process.exit(1);
}

Bun.serve({
  hostname: "0.0.0.0",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    let pathname: string;

    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return badRequest();
    }

    if (pathname.includes("\0")) {
      return badRequest();
    }

    if (pathname.endsWith(".br") || pathname.endsWith(".gz")) {
      return new Response("Not Found", { status: 404 });
    }

    const safePath = path
      .normalize(pathname)
      .replace(/^(\.\.(\/|\\|$))+/, "")
      .replace(/^\/+/, "");
    let resolvedRoot: string;

    try {
      resolvedRoot = await realpath(root);
    } catch {
      return new Response("Compass web build not found", { status: 500 });
    }

    const indexResponse = await fileResponse(
      request,
      path.join(root, "index.html"),
      resolvedRoot,
    );

    if (!indexResponse) {
      return new Response("Compass web build not found", { status: 500 });
    }

    const requestedPath = path.join(root, safePath || "index.html");
    const staticResponse = await fileResponse(
      request,
      requestedPath,
      resolvedRoot,
    );

    if (staticResponse) {
      return staticResponse;
    }

    if (path.extname(safePath)) {
      return new Response("Not Found", { status: 404 });
    }

    return indexResponse;
  },
});

console.log(`Compass web server listening on http://0.0.0.0:${port}`);
