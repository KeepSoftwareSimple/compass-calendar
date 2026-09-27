/** Text formats self-host's serve-web.ts negotiates Accept-Encoding for.
 * Binary formats like .png and .woff2 are already compressed. Keep the
 * precompress writer and the static server on this one map. */
export const COMPRESSIBLE_STATIC_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
} as const;

export const COMPRESSIBLE_STATIC_EXTENSIONS = new Set<string>(
  Object.keys(COMPRESSIBLE_STATIC_TYPES),
);
