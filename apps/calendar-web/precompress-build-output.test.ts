import { precompressBuildOutput } from "./precompress-build-output";
import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

let tempDir: string | undefined;

function makeTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), "precompress-build-output-"));
  return tempDir;
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { force: true, recursive: true });
    tempDir = undefined;
  }
});

describe("precompressBuildOutput", () => {
  it("writes .br and .gz siblings for compressible extensions only", async () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "index.js"),
      "console.log('hello world');".repeat(20),
    );
    writeFileSync(join(dir, "index.html"), "<!doctype html><html></html>");
    writeFileSync(join(dir, "favicon.ico"), Buffer.from([0, 1, 2, 3]));

    const written = await precompressBuildOutput(dir);

    expect(written.sort()).toEqual(
      [join(dir, "index.js"), join(dir, "index.html")].sort(),
    );

    const original = readFileSync(join(dir, "index.js"), "utf8");
    expect(
      brotliDecompressSync(readFileSync(join(dir, "index.js.br"))).toString(
        "utf8",
      ),
    ).toBe(original);
    expect(
      gunzipSync(readFileSync(join(dir, "index.js.gz"))).toString("utf8"),
    ).toBe(original);

    expect(() => readFileSync(join(dir, "favicon.ico.br"))).toThrow();
    expect(() => readFileSync(join(dir, "favicon.ico.gz"))).toThrow();
  });

  it("recurses into nested chunk directories", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "assets"));
    writeFileSync(
      join(dir, "assets", "chunk-abc123.js"),
      "export const x = 1;".repeat(10),
    );

    const written = await precompressBuildOutput(dir);

    expect(written).toEqual([join(dir, "assets", "chunk-abc123.js")]);
    expect(
      readFileSync(join(dir, "assets", "chunk-abc123.js.br")).length,
    ).toBeGreaterThan(0);
  });
});
