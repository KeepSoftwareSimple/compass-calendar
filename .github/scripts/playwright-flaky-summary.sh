#!/usr/bin/env bash
# Writes Playwright tests that passed only after retry into GITHUB_STEP_SUMMARY.
set -euo pipefail

report_path="${1:-test-results/playwright-report.json}"

if [ ! -f "$report_path" ]; then
  echo "No Playwright JSON report at ${report_path}; skipping flaky summary."
  exit 0
fi

if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
  exit 0
fi

export PLAYWRIGHT_JSON_REPORT="$report_path"

node --input-type=module >>"$GITHUB_STEP_SUMMARY" <<'NODE'
import fs from "node:fs";

const reportPath = process.env.PLAYWRIGHT_JSON_REPORT;
if (!reportPath) {
  process.exit(0);
}
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

/** @typedef {{ title: string; file: string; projectName: string; status: string }} FlakyRow */

/** @param {unknown[]} suites @param {FlakyRow[]} out */
function walkSuites(suites, out) {
  for (const suite of suites ?? []) {
    if (!suite || typeof suite !== "object") continue;
    const s = /** @type {{ title?: string; file?: string; specs?: unknown[]; suites?: unknown[] }} */ (
      suite
    );
    for (const spec of s.specs ?? []) {
      if (!spec || typeof spec !== "object") continue;
      const sp = /** @type {{ title?: string; tests?: unknown[] }} */ (spec);
      for (const test of sp.tests ?? []) {
        if (!test || typeof test !== "object") continue;
        const t = /** @type {{ projectName?: string; results?: { status?: string }[]; status?: string }} */ (
          test
        );
        const results = t.results ?? [];
        const hadFailure = results.some((r) => r.status === "failed");
        const finalStatus =
          t.status ??
          (results.length > 0 ? results[results.length - 1]?.status : undefined);
        if (finalStatus === "flaky" || (hadFailure && finalStatus === "passed")) {
          out.push({
            title: sp.title ?? "(untitled)",
            file: s.file ?? "(unknown file)",
            projectName: t.projectName ?? "unknown",
            status: finalStatus ?? "flaky",
          });
        }
      }
    }
    walkSuites(s.suites, out);
  }
}

const flaky = /** @type {FlakyRow[]} */ ([]);
walkSuites(report.suites, flaky);

if (flaky.length === 0) {
  process.stdout.write(
    "### Playwright flaky tests\n\nNone (every passing test passed on the first try).\n",
  );
} else {
  process.stdout.write("### Playwright flaky tests\n\n");
  process.stdout.write(
    "These tests failed at least once but passed after Playwright retry:\n\n",
  );
  for (const row of flaky) {
    process.stdout.write(
      `- \`${row.projectName}\` **${row.title}** (\`${row.file}\`)\n`,
    );
  }
  process.stdout.write("\n");
}
NODE
