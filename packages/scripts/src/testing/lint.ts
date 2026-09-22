/**
 * `bun run lint`: run every lint checker and report all of them.
 *
 * The three checkers used to be chained with `&&`, so a semantic-color hit
 * hid every constraint and Biome finding in the same run and an agent paid
 * one CI round-trip per class of error. Biome runs with --error-on-warnings
 * (a warning is a finding) and a diagnostics cap high enough to show every
 * one; the default cap silently dropped findings past the first 20.
 */

const CHECKS: { id: string; cmd: string[] }[] = [
  {
    id: "semantic-colors",
    cmd: ["bun", "packages/scripts/src/testing/check-semantic-colors.ts"],
  },
  {
    id: "agent-constraints",
    cmd: ["bun", "packages/scripts/src/testing/check-agent-constraints.ts"],
  },
  {
    id: "todo-copy",
    cmd: ["bun", "packages/scripts/src/testing/check-todo-copy.ts"],
  },
  {
    id: "biome",
    cmd: [
      "biome",
      "check",
      ".",
      "--error-on-warnings",
      "--max-diagnostics=100",
    ],
  },
];

const failed: string[] = [];
for (const check of CHECKS) {
  const result = Bun.spawnSync({
    cmd: check.cmd,
    cwd: process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) failed.push(check.id);
}

if (failed.length > 0) {
  console.error(`\nlint failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(
  "\nlint passed: semantic-colors, agent-constraints, todo-copy, biome",
);
