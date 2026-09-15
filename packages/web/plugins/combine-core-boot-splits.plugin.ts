import { type BunPlugin } from "bun";
import path from "node:path";

/**
 * After bson/rrule leave the web boot graph, Bun emits each remaining
 * shared `@core` helper as its own chunk. Modules with the same importer
 * set used to ride in the bson mixed chunk; without it, boot chunk count
 * rises. Resolve these specifier-stable helpers to one canonical file so
 * they share one chunk again. Source files stay concrete; this is web-bundler
 * only.
 */
const CORE_SRC = path.resolve(import.meta.dir, "../../core/src");
export const CORE_BOOT_SHARED_CANONICAL = path.join(
  CORE_SRC,
  "types/domain-primitives.ts",
);

export const CORE_BOOT_SHARED_SPECIFIERS = [
  "@core/constants/core.constants",
  "@core/constants/date.constants",
  "@core/types/compass-event.contracts",
  "@core/types/domain-primitives",
  "@core/util/occurrence-id",
] as const;

const SPECIFIER_SET = new Set<string>(CORE_BOOT_SHARED_SPECIFIERS);

const FILE_SUFFIXES = [
  "/constants/core.constants.ts",
  "/constants/date.constants.ts",
  "/types/compass-event.contracts.ts",
  "/types/domain-primitives.ts",
  "/util/occurrence-id.ts",
] as const;

const SOURCE_FILES = [
  "constants/core.constants.ts",
  "constants/date.constants.ts",
  "types/compass-event.contracts.ts",
  "types/domain-primitives.ts",
  "util/occurrence-id.ts",
] as const;

export function isCoreBootSharedSpecifier(specifier: string): boolean {
  const normalized = specifier.replace(/\\/g, "/");
  if (SPECIFIER_SET.has(normalized)) return true;
  return FILE_SUFFIXES.some(
    (suffix) =>
      normalized.endsWith(suffix) || normalized.endsWith(suffix.slice(0, -3)),
  );
}

const IMPORT_LINE = /^import\s+[\s\S]*?from\s+["']([^"']+)["'];?\s*$/gm;

export async function loadCoreBootSharedSource(): Promise<string> {
  const imports = new Set<string>();
  const bodies: string[] = [];

  for (const rel of SOURCE_FILES) {
    const source = await Bun.file(path.join(CORE_SRC, rel)).text();
    const withoutInternalImports = source.replace(IMPORT_LINE, (line, spec) => {
      if (isCoreBootSharedSpecifier(spec)) return "";
      imports.add(line.trim());
      return "";
    });
    bodies.push(withoutInternalImports.trim());
  }

  return `${[...imports].join("\n")}\n\n${bodies.join("\n\n")}\n`;
}

export const combineCoreBootSplitsPlugin: BunPlugin = {
  name: "combine-core-boot-splits",
  setup(build) {
    build.onResolve(
      {
        filter:
          /core\.constants|date\.constants|compass-event\.contracts|domain-primitives|occurrence-id/,
      },
      (args) => {
        if (!isCoreBootSharedSpecifier(args.path)) return;
        return { path: CORE_BOOT_SHARED_CANONICAL };
      },
    );

    build.onLoad({ filter: /domain-primitives\.ts$/ }, async (args) => {
      if (
        path.resolve(args.path) !== path.resolve(CORE_BOOT_SHARED_CANONICAL)
      ) {
        return;
      }
      return {
        contents: await loadCoreBootSharedSource(),
        loader: "ts",
      };
    });
  },
};
