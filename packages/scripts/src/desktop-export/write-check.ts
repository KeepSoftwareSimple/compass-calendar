import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface GeneratedFile {
  path: string;
  contents: string;
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

    const tempDir = mkdtempSync(join(tmpdir(), tempPrefix));
    const tempFile = join(tempDir, file.path.split("/").pop() ?? "output");
    writeFileSync(tempFile, file.contents, "utf8");
    let firstDiff = "";
    const max = Math.max(existing.length, file.contents.length);
    for (let index = 0; index < max; index += 1) {
      if (existing[index] !== file.contents[index]) {
        firstDiff = `first difference at byte ${index} in ${file.path}`;
        break;
      }
    }
    console.error(
      `${label} drift: regenerate with \`bun cli ${label}\` (${firstDiff}; temp at ${tempFile})`,
    );
    if (process.env["CI"] !== "true") {
      rmSync(tempDir, { recursive: true, force: true });
    }
    process.exit(1);
  }
}
