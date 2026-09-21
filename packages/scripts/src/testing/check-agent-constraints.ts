import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative } from "node:path";

const repoRoot = join(import.meta.dir, "../../../..");

const APP_ENTRY = "packages/web/src/index.tsx";
const CI_WORKFLOW = ".github/workflows/test-unit.yml";
const CI_BUN_VERSION = /bun-version:\s*([\d.]+)/g;
// The e2e shards run inside the Playwright image and install Bun from npm
// (no unzip for setup-bun there), so their pin is `bun@<version>`.
const E2E_WORKFLOW = ".github/workflows/test-e2e.yml";
const E2E_BUN_VERSION = /npm install[^\n]*\bbun@([\d.]+)/g;
const OVEN_BUN_TAG = /oven\/bun:([^\s]+)/g;
const DOCKERFILE_DIRS = ["self-host", ".github/docker"];
// The web images copy named files into their runtime stage rather than the
// tree, so serve-web.ts's own imports have to be listed there too.
const WEB_SERVER = "self-host/serve-web.ts";
const WEB_DOCKERFILES = [
  "self-host/Dockerfile.web",
  ".github/docker/Dockerfile.web",
];
const RELATIVE_IMPORT = / from "(\.[^"]*)";/g;
const RUNTIME_STAGE = /^FROM .+ AS runtime$/m;

const SOURCE_EXT = /\.(ts|tsx)$/;

export type ConstraintAllow = { glob: string; reason: string };

/**
 * Printed under every hit so the failure says what to do. Allowlists are
 * named so an agent can find the exemption pattern without reading this file.
 */
export const RULE_HELP: Record<string, string> = {
  barrel:
    "index.ts/index.tsx re-export barrels are banned; import the concrete file and delete the barrel (BARREL_ALLOWLIST is deliberately empty).",
  "web-locator":
    "web tests use semantic role/name/text queries and user-event, never getByTestId/querySelector/getByClassName. Structural exceptions: WEB_LOCATOR_ALLOWLIST.",
  "mongoService-import":
    "only *.db.test.ts may import the mongoService singleton; Mongo-free tests use the fast tier. Exceptions: MONGO_SERVICE_TEST_ALLOWLIST.",
  "duplicate-event-schema":
    "shared event contracts live in packages/core; import them instead of redefining EventSchema.",
  "bun-pin":
    "every oven/bun: Dockerfile tag in self-host/ and .github/docker/, and the npm bun@ install in .github/workflows/test-e2e.yml, must equal the single bun-version in .github/workflows/test-unit.yml.",
  "runtime-copy":
    "every relative import in self-host/serve-web.ts must be COPYed into the runtime stage of both web Dockerfiles; bun exits on an unresolved module and the web container restart-loops past a green image build.",
  "zod-import":
    'import Zod from "zod/v4" (or "zod/v4-mini" for the mini API); the bare "zod" path is the v3 API. Legacy config schemas: ZOD_V3_ALLOWLIST.',
  "em-dash":
    "user-facing strings must not contain an em-dash; use a comma, period, or colon. Comments are ignored. Parsers that accept typed dashes: EM_DASH_ALLOWLIST.",
  "keydown-listener":
    "register shortcuts through useAppShortcut or the engines under packages/web/src/shortcuts/, not a raw keydown listener. Existing engines: KEYDOWN_LISTENER_ALLOWLIST.",
  "phosphor-barrel":
    'import icons from "@phosphor-icons/react/dist/csr/<Icon>" (and IconContext / Icon types from dist/lib). The package barrel pulls every glyph into the boot set. Test files are exempt; they are not in the bundle.',
};

/** Empty: remaining barrels were deleted; imports target the concrete files. */
export const BARREL_ALLOWLIST: ConstraintAllow[] = [];

/**
 * Structural locator exceptions. New tests outside these globs are still
 * flagged, including `packages/web/src/auth/providers/**`.
 */
export const WEB_LOCATOR_ALLOWLIST: ConstraintAllow[] = [
  {
    glob: "packages/web/src/shortcuts/**/*.test.tsx",
    reason:
      "hint overlays and the edit-sequence menu expose data-* roots, not roles",
  },
  {
    glob: "packages/web/src/grid/components/*.test.tsx",
    reason: "grid layers and edge-focus are data-* layout hooks",
  },
  {
    glob: "packages/web/src/components/Sidebar/MonthPicker/*.test.tsx",
    reason: "react-datepicker internals have no accessible names",
  },
  {
    glob: "packages/web/src/components/CommandPalette/*.test.tsx",
    reason: "command rows expose aria-hidden keycaps",
  },
  {
    glob: "packages/web/src/components/ContextMenu/*.test.tsx",
    reason: "the portal menu is class-based, not a named role",
  },
  {
    glob: "packages/web/src/components/Focusable/*.test.tsx",
    reason: "the focus ring is a CSS class with no role",
  },
  {
    glob: "packages/web/src/components/SelectView/*.test.tsx",
    reason: "the open listbox is still a testid surface",
  },
  {
    glob: "packages/web/src/components/Shortcuts/*.test.tsx",
    reason: "keycaps are aria-hidden",
  },
  {
    glob: "packages/web/src/components/Sidebar/CalendarList/*.test.tsx",
    reason: "the color swatch is aria-hidden",
  },
  {
    glob: "packages/web/src/components/Tooltip/*.test.tsx",
    reason: "shortcut-node is a test-only child without a name",
  },
  {
    glob: "packages/web/src/components/AuthenticatedLayout/*.test.tsx",
    reason: "route-outlet fixtures use testids",
  },
  {
    glob: "packages/web/src/views/Forms/EventForm/**/*.test.tsx",
    reason: "recurrence data-selected chips and read-only fieldsets",
  },
  {
    glob: "packages/web/src/views/Life/*.test.tsx",
    reason: "life-grid dots are data-total-dots and ring classes",
  },
];

/**
 * Db tests seed and assert through the mongoService singleton. Sync's
 * `sync-mongo.service` is out of scope. New backend unit tests that are not
 * `*.db.test.ts` still cannot import mongoService.
 */
export const MONGO_SERVICE_TEST_ALLOWLIST: ConstraintAllow[] = [
  {
    glob: "packages/backend/src/**/*.db.test.ts",
    reason:
      "db tests insert and assert via the mongoService singleton until a collection accessor replaces it",
  },
  {
    glob: "packages/backend/src/**/mongo.service.test.ts",
    reason: "this file is the mongoService unit test",
  },
];

/** Config schemas still on the Zod v3 API; migrate them together, not one at a time. */
export const ZOD_V3_ALLOWLIST: ConstraintAllow[] = [
  {
    glob: "packages/scripts/src/testing/check-agent-constraints.test.ts",
    reason: "fixture strings for this checker",
  },
  {
    glob: "packages/core/src/config/compass.config.ts",
    reason: "config validation is written against the v3 API",
  },
  {
    glob: "packages/core/src/types/config.types.ts",
    reason: "config types pair with compass.config.ts",
  },
  {
    glob: "packages/backend/src/common/constants/config.constants.ts",
    reason: "backend config constants pair with compass.config.ts",
  },
];

/** Non-test web source that legitimately contains an em-dash outside a comment. */
export const EM_DASH_ALLOWLIST: ConstraintAllow[] = [];

/**
 * Raw keydown listeners outside packages/web/src/shortcuts/. Each existing one
 * is an engine or an isolated modal; new bindings go through useAppShortcut.
 */
export const KEYDOWN_LISTENER_ALLOWLIST: ConstraintAllow[] = [
  {
    glob: "packages/web/src/settings/useSettingsShortcuts.ts",
    reason: "settings modal owns its own scoped bindings",
  },
  {
    glob: "packages/web/src/components/WelcomeModal/useWelcomeJumpShortcuts.ts",
    reason: "welcome modal jump keys run before the shortcut engine mounts",
  },
  {
    glob: "packages/web/src/components/OverlayPanel/overlay-escape.ts",
    reason: "shared Escape handler for overlay panels",
  },
  {
    glob: "packages/web/src/components/AuthModal/AuthModal.tsx",
    reason: "auth modal traps Escape while a request is in flight",
  },
  {
    glob: "packages/web/src/components/ShortcutShowcase/ShortcutShowcase.tsx",
    reason: "the showcase game simulates the engine in capture phase",
  },
];

const REEXPORT_FROM =
  /export\s+(?:\*|type\s+\{[^}]*\}|\{[^}]*\})\s+from\s+["']/;
const LOCAL_IMPORT =
  /import\s+(?:type\s+)?[\s\S]*?\s+from\s+["']\.\.?\/[^"']+["']/;
const BARE_NAMED_EXPORT = /export\s+\{[^}]+\}\s*;/;
const WEB_LOCATOR =
  /\bgetByTestId\s*\(|\bquerySelector(All)?\s*\(|\bgetByClassName\s*\(/;
const MONGO_SERVICE_IMPORT = /from\s+["'][^"']*(?<!sync-)mongo\.service["']/;
const DUPLICATE_EVENT_SCHEMA =
  /(?:const|let|var)\s+EventSchema\s*=\s*z\.object/;
const ZOD_V3_IMPORT = /from\s+["']zod(?:\/v3)?["']/;
const KEYDOWN_LISTENER = /addEventListener\(\s*["']keydown["']/;
const PHOSPHOR_BARREL =
  /(?:from\s+|import\s*\(\s*)["']@phosphor-icons\/react["']/;
const EM_DASH = /\u2014/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(^|\s)\/\/.*$/gm;

export type ConstraintHit = {
  path: string;
  rule: string;
  line: number;
  detail?: string;
};

export function matchesConstraintAllow(
  path: string,
  allowlist: ConstraintAllow[],
): boolean {
  return allowlist.some((entry) => matchGlob(path, entry.glob));
}

export function matchGlob(path: string, glob: string): boolean {
  const pattern = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\0")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, "(?:.*/)?");
  return new RegExp(`^${pattern}$`).test(path);
}

export function isBarrelSource(source: string): boolean {
  if (REEXPORT_FROM.test(source)) return true;
  return LOCAL_IMPORT.test(source) && BARE_NAMED_EXPORT.test(source);
}

export function locatorHits(source: string): number[] {
  return lineNumbers(source, WEB_LOCATOR);
}

export function mongoServiceImportHits(source: string): number[] {
  return lineNumbers(source, MONGO_SERVICE_IMPORT);
}

export function duplicateEventSchemaHits(source: string): number[] {
  return lineNumbers(source, DUPLICATE_EVENT_SCHEMA);
}

export function zodV3ImportHits(source: string): number[] {
  return lineNumbers(source, ZOD_V3_IMPORT);
}

export function keydownListenerHits(source: string): number[] {
  return lineNumbers(source, KEYDOWN_LISTENER);
}

export function phosphorBarrelHits(source: string): number[] {
  return lineNumbers(source, PHOSPHOR_BARREL);
}

/**
 * Phosphor CSR defs ship six SVG weights in one Map. IconBase picks the
 * weight at runtime, so unused thin/light/duotone entries cannot tree-shake.
 * The web build plugin calls this while loading those def modules.
 */
const UNUSED_PHOSPHOR_WEIGHT =
  /\n {2}\[\n {4}"(?:thin|light|duotone)",[\s\S]*?\n {2}\],?/g;

export function stripUnusedPhosphorWeights(source: string): string {
  return source.replace(UNUSED_PHOSPHOR_WEIGHT, "");
}

/**
 * These four modules are the boot-graph importers of X and Check. Sharing
 * those two glyphs across boot chunks extracts a phosphor-only chunk and
 * pushes the boot chunk count up by one. Inlining them here keeps that
 * chunk on the lazy route graph. Paths are Phosphor's regular X and
 * regular/bold Check (MIT).
 */
const BOOT_PHOSPHOR_INLINE_FILES = new Set([
  "ConnectCalendarPrompt.tsx",
  "DiscardUnsavedChangesDialog.tsx",
  "MissingPermissionsModal.tsx",
  "PointerHint.tsx",
]);

const PHOSPHOR_X_IMPORT =
  /^import \{ (X|XIcon) \} from "@phosphor-icons\/react\/dist\/csr\/X";\r?\n/m;
const PHOSPHOR_CHECK_IMPORT =
  /^import \{ CheckIcon \} from "@phosphor-icons\/react\/dist\/csr\/Check";\r?\n/m;

function phosphorXComponent(name: string): string {
  return `function ${name}({ size = 16, ...props }: { size?: number | string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="currentColor" viewBox="0 0 256 256" {...props}>
      <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
    </svg>
  );
}
`;
}

function phosphorCheckComponent(): string {
  return `function CheckIcon({ size = 16, weight = "regular", ...props }: { size?: number | string; weight?: string }) {
  const d = weight === "bold"
    ? "M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"
    : "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="currentColor" viewBox="0 0 256 256" {...props}>
      <path d={d} />
    </svg>
  );
}
`;
}

export function inlineBootPhosphorIcons(
  filePath: string,
  source: string,
): string {
  const base = filePath.split(/[/\\]/).pop() ?? "";
  if (!BOOT_PHOSPHOR_INLINE_FILES.has(base)) return source;
  let next = source;
  const xImport = next.match(PHOSPHOR_X_IMPORT);
  if (xImport?.[1]) {
    next = next.replace(xImport[0], "");
    next += `\n${phosphorXComponent(xImport[1])}`;
  }
  if (PHOSPHOR_CHECK_IMPORT.test(next)) {
    next = next.replace(PHOSPHOR_CHECK_IMPORT, "");
    next += `\n${phosphorCheckComponent()}`;
  }
  return next;
}

/** Em-dashes outside comments. Comment bodies are blanked so line numbers hold. */
export function emDashHits(source: string): number[] {
  const withoutComments = source
    .replace(BLOCK_COMMENT, (match) => match.replace(/[^\n]/g, " "))
    .replace(LINE_COMMENT, (_match, lead: string) => lead);
  return lineNumbers(withoutComments, EM_DASH);
}

export function formatHit(hit: ConstraintHit): string {
  const help = RULE_HELP[hit.rule] ?? "";
  const lines = [`${hit.path}:${hit.line} ${hit.rule}`];
  if (hit.detail) lines.push(`  ${hit.detail}`);
  if (help) lines.push(`  ${help}`);
  return lines.join("\n");
}

export function ovenBunVersion(tag: string): string {
  return tag.replace(/-slim$/, "");
}

export function scanBunDockerfilePins(root = repoRoot): ConstraintHit[] {
  const hits: ConstraintHit[] = [];
  const workflowPath = join(root, CI_WORKFLOW);
  if (!existsSync(workflowPath)) {
    hits.push({
      path: CI_WORKFLOW,
      rule: "bun-pin",
      line: 1,
      detail: "workflow file is missing, so no bun-version pin can be read",
    });
    return hits;
  }

  const workflow = readFileSync(workflowPath, "utf8");
  const ciVersions = [
    ...new Set([...workflow.matchAll(CI_BUN_VERSION)].map((match) => match[1])),
  ];
  if (ciVersions.length !== 1 || ciVersions[0] === undefined) {
    hits.push({
      path: CI_WORKFLOW,
      rule: "bun-pin",
      line: 1,
      detail: `expected exactly one bun-version, found ${
        ciVersions.length === 0 ? "none" : ciVersions.join(", ")
      }`,
    });
    return hits;
  }
  const expected = ciVersions[0];

  const e2ePath = join(root, E2E_WORKFLOW);
  if (existsSync(e2ePath)) {
    const e2e = readFileSync(e2ePath, "utf8");
    const e2eVersions = [...e2e.matchAll(E2E_BUN_VERSION)].map((m) => m[1]);
    if (e2eVersions.length === 0) {
      hits.push({
        path: E2E_WORKFLOW,
        rule: "bun-pin",
        line: 1,
        detail: "expected an `npm install ... bun@<version>` step",
      });
    }
    for (const match of e2e.matchAll(E2E_BUN_VERSION)) {
      if (match[1] === expected) continue;
      hits.push({
        path: E2E_WORKFLOW,
        rule: "bun-pin",
        line: e2e.slice(0, match.index ?? 0).split("\n").length,
        detail: `bun@${match[1]} but CI pins ${expected}`,
      });
    }
  }

  for (const relDir of DOCKERFILE_DIRS) {
    const absDir = join(root, relDir);
    if (!existsSync(absDir)) continue;
    for (const name of readdirSync(absDir)) {
      if (!name.startsWith("Dockerfile")) continue;
      const rel = `${relDir}/${name}`;
      const source = readFileSync(join(root, rel), "utf8");
      for (const match of source.matchAll(OVEN_BUN_TAG)) {
        const tag = match[1] ?? "";
        if (ovenBunVersion(tag) === expected) continue;
        const line = source.slice(0, match.index ?? 0).split("\n").length;
        hits.push({
          path: rel,
          rule: "bun-pin",
          line,
          detail: `oven/bun:${tag} but CI pins ${expected}`,
        });
      }
    }
  }
  return hits;
}

export function scanRuntimeStageCopies(root = repoRoot): ConstraintHit[] {
  const hits: ConstraintHit[] = [];
  const serverPath = join(root, WEB_SERVER);
  if (!existsSync(serverPath)) {
    return [
      { path: WEB_SERVER, rule: "runtime-copy", line: 1, detail: "missing" },
    ];
  }

  const server = readFileSync(serverPath, "utf8");

  for (const match of server.matchAll(RELATIVE_IMPORT)) {
    const specifier = match[1] ?? "";
    const line = server.slice(0, match.index ?? 0).split("\n").length;
    const bare = posix.join("self-host", specifier);
    // Bun resolves an extensionless specifier to the .ts file on disk.
    const rel = existsSync(join(root, bare)) ? bare : `${bare}.ts`;

    if (!existsSync(join(root, rel))) {
      hits.push({
        path: WEB_SERVER,
        rule: "runtime-copy",
        line,
        detail: `imports "${specifier}", which resolves to no file`,
      });
      continue;
    }

    for (const dockerfile of WEB_DOCKERFILES) {
      const dockerfilePath = join(root, dockerfile);
      if (!existsSync(dockerfilePath)) continue;

      const source = readFileSync(dockerfilePath, "utf8");
      const stageAt = source.search(RUNTIME_STAGE);
      if (stageAt === -1) {
        hits.push({
          path: dockerfile,
          rule: "runtime-copy",
          line: 1,
          detail: "no `FROM ... AS runtime` stage to copy into",
        });
        continue;
      }

      if (source.slice(stageAt).includes(`/app/${rel} ./${rel}`)) continue;

      hits.push({
        path: dockerfile,
        rule: "runtime-copy",
        line: source.slice(0, stageAt).split("\n").length,
        detail: `runtime stage never copies ${rel}, imported by ${WEB_SERVER}:${line}`,
      });
    }
  }

  return hits;
}

export function scanConstraints(root = repoRoot): ConstraintHit[] {
  const hits: ConstraintHit[] = [];
  for (const file of walk(join(root, "packages"))) {
    const rel = posixRel(root, file);
    const source = readFileSync(file, "utf8");

    if (isIndexModule(rel) && rel !== APP_ENTRY && isBarrelSource(source)) {
      if (!matchesConstraintAllow(rel, BARREL_ALLOWLIST)) {
        hits.push({ path: rel, rule: "barrel", line: 1 });
      }
    }

    if (isWebTest(rel) && !matchesConstraintAllow(rel, WEB_LOCATOR_ALLOWLIST)) {
      for (const line of locatorHits(source)) {
        hits.push({ path: rel, rule: "web-locator", line });
      }
    }

    if (
      isBackendOrSyncTest(rel) &&
      !matchesConstraintAllow(rel, MONGO_SERVICE_TEST_ALLOWLIST)
    ) {
      for (const line of mongoServiceImportHits(source)) {
        hits.push({ path: rel, rule: "mongoService-import", line });
      }
    }

    if (
      (rel.startsWith("packages/web/") ||
        rel.startsWith("packages/backend/")) &&
      !rel.includes(".test.") &&
      !rel.includes(".spec.")
    ) {
      for (const line of duplicateEventSchemaHits(source)) {
        hits.push({ path: rel, rule: "duplicate-event-schema", line });
      }
    }

    if (!matchesConstraintAllow(rel, ZOD_V3_ALLOWLIST)) {
      for (const line of zodV3ImportHits(source)) {
        hits.push({ path: rel, rule: "zod-import", line });
      }
    }

    if (
      rel.startsWith("packages/web/src/") &&
      !rel.includes(".test.") &&
      !rel.includes(".spec.")
    ) {
      for (const line of phosphorBarrelHits(source)) {
        hits.push({ path: rel, rule: "phosphor-barrel", line });
      }
    }

    if (isEmailSource(rel)) {
      if (!matchesConstraintAllow(rel, EM_DASH_ALLOWLIST)) {
        for (const line of emDashHits(source)) {
          hits.push({ path: rel, rule: "em-dash", line });
        }
      }
    }

    if (isWebSource(rel)) {
      if (!matchesConstraintAllow(rel, EM_DASH_ALLOWLIST)) {
        for (const line of emDashHits(source)) {
          hits.push({ path: rel, rule: "em-dash", line });
        }
      }
      if (
        !rel.startsWith("packages/web/src/shortcuts/") &&
        !matchesConstraintAllow(rel, KEYDOWN_LISTENER_ALLOWLIST)
      ) {
        for (const line of keydownListenerHits(source)) {
          hits.push({ path: rel, rule: "keydown-listener", line });
        }
      }
    }
  }
  return hits;
}

function isWebSource(rel: string): boolean {
  return (
    rel.startsWith("packages/web/src/") &&
    !rel.includes(".test.") &&
    !rel.includes(".spec.") &&
    !rel.includes("/__tests__/") &&
    !rel.includes("/__mocks__/")
  );
}

function isEmailSource(rel: string): boolean {
  return (
    rel.startsWith("packages/backend/src/email/") &&
    !rel.includes(".test.") &&
    !rel.includes(".spec.")
  );
}

function isIndexModule(rel: string): boolean {
  return rel.endsWith("/index.ts") || rel.endsWith("/index.tsx");
}

function isWebTest(rel: string): boolean {
  return (
    rel.startsWith("packages/web/") &&
    (rel.endsWith(".test.ts") ||
      rel.endsWith(".test.tsx") ||
      rel.endsWith(".spec.ts") ||
      rel.endsWith(".spec.tsx"))
  );
}

function isBackendOrSyncTest(rel: string): boolean {
  return (
    (rel.startsWith("packages/backend/") || rel.startsWith("packages/sync/")) &&
    (rel.includes(".test.") || rel.includes(".spec."))
  );
}

function lineNumbers(source: string, pattern: RegExp): number[] {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const lines: number[] = [];
  for (const match of source.matchAll(global)) {
    if (match.index == null) continue;
    lines.push(source.slice(0, match.index).split("\n").length);
  }
  return lines;
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "build") return [];
      return walk(path);
    }
    if (!SOURCE_EXT.test(entry.name)) return [];
    return [path];
  });
}

function posixRel(root: string, file: string): string {
  return relative(root, file).split("\\").join("/");
}

if (import.meta.main) {
  const hits = [
    ...scanConstraints(),
    ...scanBunDockerfilePins(),
    ...scanRuntimeStageCopies(),
  ];
  if (hits.length > 0) {
    console.error("Agent constraint violations:");
    for (const hit of hits) {
      console.error(formatHit(hit));
    }
    process.exit(1);
  }
}
