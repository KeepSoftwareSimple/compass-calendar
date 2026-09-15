import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  brotliCompressSync,
  gzipSync,
  constants as zlibConstants,
} from "node:zlib";

// Extensions worth precompressing: text formats that self-host's serve-web.ts
// (no reverse proxy in front of it) negotiates Accept-Encoding for. Binary
// formats like .png and .woff2 are already compressed and would only grow
// under brotli/gzip.
const COMPRESSIBLE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".wasm",
]);

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

/**
 * Writes `.br` and `.gz` siblings next to every compressible file in
 * `outdir`, for self-host deployments that serve `build/web` without a
 * reverse proxy. Returns the source paths that got siblings.
 */
export async function precompressBuildOutput(
  outdir: string,
): Promise<string[]> {
  const files = await listFiles(outdir);
  const written: string[] = [];

  for (const filePath of files) {
    if (!COMPRESSIBLE_EXTENSIONS.has(path.extname(filePath))) {
      continue;
    }

    const buffer = Buffer.from(await Bun.file(filePath).arrayBuffer());

    const brotli = brotliCompressSync(buffer, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buffer.byteLength,
      },
    });
    const gzip = gzipSync(buffer, { level: 9 });

    await writeFile(`${filePath}.br`, brotli);
    await writeFile(`${filePath}.gz`, gzip);
    written.push(filePath);
  }

  return written;
}
