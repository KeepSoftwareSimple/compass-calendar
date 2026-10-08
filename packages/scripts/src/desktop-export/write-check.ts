import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface GeneratedFile {
  path: string;
  contents: string;
}

function firstDifference(
  existing: string,
  expected: string,
  path: string,
): string {
  const max = Math.max(existing.length, expected.length);
  for (let index = 0; index < max; index += 1) {
    if (existing[index] !== expected[index]) {
      return `first difference at byte ${index} in ${path}`;
    }
  }
  return `same bytes but unequal strings in ${path}`;
}

export function writeGeneratedFiles(files: GeneratedFile[]): void {
  for (const file of files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.contents, "utf8");
  }
}

export function assertGeneratedFilesMatch(
  files: GeneratedFile[],
  label: string,
): void {
  const tempPrefix = `${label.replaceAll(/[:/]/g, "-")}-`;
  for (const file of files) {
    const existing = readFileSync(file.path, "utf8");
    if (existing === file.contents) {
      continue;
    }

    // Keep the expected bytes on disk: the message points at them so the
    // reader can diff against the stale file, and this process exits next.
    const tempDir = mkdtempSync(join(tmpdir(), tempPrefix));
    const tempFile = join(tempDir, file.path.split("/").pop() ?? "output");
    writeFileSync(tempFile, file.contents, "utf8");
    console.error(
      `${label} drift: regenerate with \`bun cli ${label}\` (${firstDifference(
        existing,
        file.contents,
        file.path,
      )}; expected bytes at ${tempFile})`,
    );
    process.exit(1);
  }
}
