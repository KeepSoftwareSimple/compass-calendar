import { Glob } from "bun";

// Bun version behavior has drifted between patch releases (e.g. the 1.4
// directory-scan regression this runner works around). Warn rather than
// fail so a mismatched local bun doesn't block a run outright.
export function warnIfBunVersionMismatch(pinned: string): void {
  if (Bun.version !== pinned && !Bun.version.startsWith(`${pinned}-`)) {
    console.warn(
      `warning: running bun ${Bun.version}, repo pins bun@${pinned} (see package.json "packageManager"). ` +
        `Test behavior may differ from CI.`,
    );
  }
}

export function resolveTestFiles(
  scan: string,
  extraArgs: string[],
): { files: string[]; bunFlags: string[] } {
  const explicit = extraArgs.filter((arg) => !arg.startsWith("-"));
  const bunFlags = extraArgs.filter((arg) => arg.startsWith("-"));

  if (explicit.length > 0) {
    return {
      files: explicit.map((arg) => (arg.startsWith("./") ? arg : `./${arg}`)),
      bunFlags,
    };
  }

  return {
    files: Array.from(new Glob(scan).scanSync("."))
      .map((file) => `./${file.replace(/^\.\//, "")}`)
      .sort(),
    bunFlags,
  };
}

export function parseExtraArgs(extraArgs: string[]): {
  bunFlags: string[];
  ignorePattern?: string;
  explicitPaths: string[];
} {
  const bunFlags: string[] = [];
  const explicitPaths: string[] = [];
  let ignorePattern: string | undefined;

  for (let i = 0; i < extraArgs.length; i++) {
    const arg = extraArgs[i]!;

    if (arg === "--path-ignore-patterns") {
      ignorePattern = extraArgs[i + 1];
      i++;
      continue;
    }

    if (arg.startsWith("-")) {
      bunFlags.push(arg);
      continue;
    }

    if (!arg.includes("*")) {
      explicitPaths.push(arg.startsWith("./") ? arg : `./${arg}`);
      continue;
    }

    const matches = Array.from(new Glob(arg).scanSync("."));
    if (matches.length === 0) {
      console.error(`No test files matched: ${arg}`);
      process.exit(1);
    }

    for (const match of matches) {
      explicitPaths.push(
        match.startsWith("./") ? match : `./${match.replace(/^\.\//, "")}`,
      );
    }
  }

  return { bunFlags, ignorePattern, explicitPaths };
}

export function resolveTestTargets(
  scan: string,
  extraArgs: string[],
  options: { expandDirectory?: boolean } = {},
): { targets: string[]; bunFlags: string[]; label: string } {
  const { bunFlags, ignorePattern, explicitPaths } = parseExtraArgs(extraArgs);

  if (explicitPaths.length > 0) {
    return {
      targets: explicitPaths,
      bunFlags,
      label: `${explicitPaths.length} test files`,
    };
  }

  const flags = [...bunFlags];
  if (ignorePattern) {
    flags.push("--path-ignore-patterns", ignorePattern);
  }

  // Bun 1.4's directory-scan test discovery balloons memory (tens of GB,
  // never finishing) on apps/calendar-web/src's ~200 files. Expand to an explicit
  // file list instead. Not used by test-mongo-env.ts: those profiles run
  // --parallel against a shared mongod, where a huge argv of per-file paths
  // has previously hung the runner — directory passthrough stays there.
  if (options.expandDirectory) {
    const glob = `${scan.replace(/\/$/, "")}/**/*.{test,spec}.{ts,tsx}`;
    const files = resolveTestFiles(glob, []).files;
    // A zero-match glob (a typo'd scan path, a package with no matching test
    // files) would otherwise silently fall through to spawning `bun test`
    // with no path args at all - which reverts to the exact directory-scan
    // discovery this expansion exists to avoid, with no diagnostic pointing
    // at the real cause.
    if (files.length === 0) {
      console.error(`No test files matched: ${glob}`);
      process.exit(1);
    }
    return {
      targets: files,
      bunFlags: flags,
      label: scan,
    };
  }

  return { targets: [scan], bunFlags: flags, label: scan };
}

export function formatDuration(started: number): string {
  return ((Date.now() - started) / 1000).toFixed(1);
}
