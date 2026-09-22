import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = join(import.meta.dir, "../../../..");
const TODO_COPY = `TODO${"(copy)"}`;

/** Placeholder copy lives here until the real drip copy ships. */
export const TODO_COPY_ALLOWLIST = new Set([
  "packages/backend/src/email/welcome-sequence.content.ts",
  "packages/scripts/src/testing/check-todo-copy.ts",
  "packages/scripts/src/testing/check-todo-copy.test.ts",
]);

const SOURCE_EXT = /\.(ts|tsx)$/;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "build") {
        return [];
      }
      return walk(path);
    }
    if (!SOURCE_EXT.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

function posixRel(root: string, file: string): string {
  return relative(root, file).split("\\").join("/");
}

export function findTodoCopyViolations(root = repoRoot): string[] {
  const hits: string[] = [];
  const packagesRoot = join(root, "packages");
  if (!existsSync(packagesRoot)) {
    return hits;
  }
  for (const file of walk(packagesRoot)) {
    const rel = posixRel(root, file);
    if (TODO_COPY_ALLOWLIST.has(rel)) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    if (source.includes(TODO_COPY)) {
      hits.push(rel);
    }
  }
  return hits;
}

if (import.meta.main) {
  const hits = findTodoCopyViolations();
  if (hits.length > 0) {
    console.error(
      "TODO(copy) placeholder markers must not ship outside the welcome content file:",
    );
    for (const hit of hits) {
      console.error(`  ${hit}`);
    }
    process.exit(1);
  }

  if (
    !existsSync(
      join(repoRoot, "packages/backend/src/email/welcome-sequence.content.ts"),
    )
  ) {
    console.error("welcome-sequence.content.ts is missing");
    process.exit(1);
  }

  console.log("todo-copy check passed");
}
