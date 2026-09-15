import {
  ALWAYS_BOOT_SOURCES,
  collectBootOutputKeys,
  parseBuildMetafile,
} from "./inject-module-preloads";
import path from "node:path";
import { gzipSync } from "node:zlib";

export interface BootSizeBudget {
  chunkCount: number;
  totalGzipBytes: number;
  packages: Record<string, number>;
}

export interface PackageAttribution {
  name: string;
  bytes: number;
  localeBytes: number;
}

export interface BootSizeReport {
  chunkCount: number;
  totalRawBytes: number;
  totalGzipBytes: number;
  packages: PackageAttribution[];
}

const NODE_MODULES = "node_modules/";
const ZOD_LOCALES = "/v4/locales/";
const TOP_PACKAGE_COUNT = 20;

function bytesInOutputOf(info: unknown): number {
  if (!info || typeof info !== "object") return 0;
  if (!("bytesInOutput" in info)) return 0;
  const bytes = (info as { bytesInOutput?: unknown }).bytesInOutput;
  return typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
}

/**
 * Package name from a metafile input path. Bun's isolated linker stores
 * packages at `node_modules/.bun/<pkg>@<ver>/node_modules/<pkg>/...`, so
 * the last `node_modules/` segment is the real name (`zod`, `@scope/pkg`).
 * First-party sources have no `node_modules/` segment and return null.
 */
export function packageNameFromInput(input: string): string | null {
  const idx = input.lastIndexOf(NODE_MODULES);
  if (idx === -1) return null;
  const rest = input.slice(idx + NODE_MODULES.length);
  if (rest.length === 0) return null;
  const parts = rest.split("/");
  const first = parts[0];
  if (!first) return null;
  if (first.startsWith("@")) {
    const scoped = parts[1];
    return scoped ? `${first}/${scoped}` : first;
  }
  return first;
}

export function attributeBootBytesByPackage(
  metafile: string | object | undefined,
  bootKeys: string[],
): PackageAttribution[] {
  const meta = parseBuildMetafile(metafile);
  const byPackage = new Map<string, PackageAttribution>();

  for (const key of bootKeys) {
    const inputs = meta.outputs[key]?.inputs;
    if (!inputs) continue;
    for (const [input, info] of Object.entries(inputs)) {
      const name = packageNameFromInput(input);
      if (!name) continue;
      const bytes = bytesInOutputOf(info);
      const current = byPackage.get(name) ?? {
        name,
        bytes: 0,
        localeBytes: 0,
      };
      current.bytes += bytes;
      if (input.includes(ZOD_LOCALES)) current.localeBytes += bytes;
      byPackage.set(name, current);
    }
  }

  return [...byPackage.values()].sort((a, b) => {
    if (b.bytes !== a.bytes) return b.bytes - a.bytes;
    return a.name.localeCompare(b.name);
  });
}

function outputFileName(key: string): string {
  return key.replace(/^\.\//, "");
}

async function gzipSizeOf(filePath: string): Promise<number> {
  const bytes = await Bun.file(filePath).arrayBuffer();
  return gzipSync(Buffer.from(bytes)).byteLength;
}

export async function computeBootSizeReport(
  outdir: string,
  metafile: string | object | undefined,
  alwaysBootSources: string[] = ALWAYS_BOOT_SOURCES,
): Promise<BootSizeReport> {
  const bootKeys = collectBootOutputKeys(metafile, alwaysBootSources);
  const packages = attributeBootBytesByPackage(metafile, bootKeys);

  let totalRawBytes = 0;
  let totalGzipBytes = 0;
  for (const key of bootKeys) {
    const filePath = path.join(outdir, outputFileName(key));
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      throw new Error(`Boot chunk missing from ${outdir}: ${key}`);
    }
    totalRawBytes += file.size;
    totalGzipBytes += await gzipSizeOf(filePath);
  }

  return {
    chunkCount: bootKeys.length,
    totalRawBytes,
    totalGzipBytes,
    packages,
  };
}

function formatBytes(n: number): string {
  return `${n.toLocaleString("en-US")} B`;
}

export function formatBootSizeReport(report: BootSizeReport): string {
  const lines = [
    "Boot-set size",
    `  chunks  ${report.chunkCount.toLocaleString("en-US")}`,
    `  raw     ${formatBytes(report.totalRawBytes)}`,
    `  gzip    ${formatBytes(report.totalGzipBytes)}`,
    "",
    "  Top packages by minified bytes:",
  ];

  const top = report.packages.slice(0, TOP_PACKAGE_COUNT);
  const nameWidth = Math.max(8, ...top.map((pkg) => pkg.name.length));
  for (const pkg of top) {
    const locales =
      pkg.localeBytes > 0
        ? `  (${formatBytes(pkg.localeBytes)} in v4/locales)`
        : "";
    lines.push(
      `    ${pkg.name.padEnd(nameWidth)}  ${formatBytes(pkg.bytes)}${locales}`,
    );
  }

  return lines.join("\n");
}

export function parseBootSizeBudget(raw: unknown): BootSizeBudget {
  if (!raw || typeof raw !== "object") {
    throw new Error("boot-size-budget.json must be an object");
  }
  const record = raw as Record<string, unknown>;
  if (
    typeof record["chunkCount"] !== "number" ||
    typeof record["totalGzipBytes"] !== "number" ||
    !record["packages"] ||
    typeof record["packages"] !== "object"
  ) {
    throw new Error(
      "boot-size-budget.json needs chunkCount, totalGzipBytes, and packages",
    );
  }
  const packages: Record<string, number> = {};
  for (const [name, ceiling] of Object.entries(
    record["packages"] as Record<string, unknown>,
  )) {
    if (typeof ceiling !== "number" || !Number.isFinite(ceiling)) {
      throw new Error(
        `boot-size-budget.json packages.${name} must be a number`,
      );
    }
    packages[name] = ceiling;
  }
  return {
    chunkCount: record["chunkCount"],
    totalGzipBytes: record["totalGzipBytes"],
    packages,
  };
}

export function bootSizeBudgetViolations(
  report: BootSizeReport,
  budget: BootSizeBudget,
): string[] {
  const violations: string[] = [];

  for (const pkg of report.packages) {
    const ceiling = budget.packages[pkg.name];
    if (ceiling === undefined) {
      violations.push(`${pkg.name}: ${pkg.bytes} B has no declared ceiling`);
      continue;
    }
    if (pkg.bytes > ceiling) {
      violations.push(
        `${pkg.name}: ${pkg.bytes} B exceeds ceiling ${ceiling} B by ${pkg.bytes - ceiling} B`,
      );
    }
  }

  if (report.totalGzipBytes > budget.totalGzipBytes) {
    violations.push(
      `gzip: ${report.totalGzipBytes} B exceeds ceiling ${budget.totalGzipBytes} B by ${report.totalGzipBytes - budget.totalGzipBytes} B`,
    );
  }

  if (report.chunkCount > budget.chunkCount) {
    violations.push(
      `chunks: ${report.chunkCount} exceeds ceiling ${budget.chunkCount} by ${report.chunkCount - budget.chunkCount}`,
    );
  }

  return violations;
}

// The budget is measured against self-host/Dockerfile.web's generated config
// (what ships) and enforced on PRs with .github/perf/compass.perf.yaml; see
// that file's header for why the two are interchangeable.
export async function loadBootSizeBudget(
  budgetPath = path.resolve(import.meta.dir, "boot-size-budget.json"),
): Promise<BootSizeBudget> {
  return parseBootSizeBudget(await Bun.file(budgetPath).json());
}

export async function reportBootSize(
  outdir: string,
  metafile: string | object | undefined,
  budget?: BootSizeBudget,
): Promise<string[]> {
  const report = await computeBootSizeReport(outdir, metafile);
  // biome-ignore lint/suspicious/noConsole: Preserve build progress output.
  console.log(formatBootSizeReport(report));

  const resolved = budget ?? (await loadBootSizeBudget());
  const violations = bootSizeBudgetViolations(report, resolved);
  if (violations.length > 0) {
    console.error(
      [
        "boot-size budget exceeded:",
        ...violations.map((line) => `  ${line}`),
      ].join("\n"),
    );
  }

  return violations;
}
