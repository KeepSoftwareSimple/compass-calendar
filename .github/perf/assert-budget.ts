/**
 * Performance budget gate, invoked by .github/workflows/perf-budget.yml.
 *
 * Runs Lighthouse against the compressed local server a few times per profile
 * and asserts the median against the budgets below. Medians are used because
 * single Lighthouse runs vary run-to-run, especially on CI runners.
 *
 * Lighthouse is pinned because @lhci/cli's bundled Lighthouse 12 reports
 * NO_LCP against current Chrome; 13.x traces LCP correctly.
 *
 * Two profiles, because desktop alone was hiding the problem that matters.
 * Desktop is the blocking gate. Mobile (Lighthouse's default preset: mobile
 * emulation over throttled 4G) is warn-only and exists because production's
 * slowest real users are mobile and far from the origin - the cohort desktop
 * numbers say nothing about. Both run against localhost, so neither sees real
 * RTT; treat mobile as a throttling proxy, not a field measurement.
 *
 * CALIBRATE THESE FROM A CI RUN, NEVER FROM A LAPTOP. The same build measures
 * ~150 KB smaller locally than on an ubuntu-latest runner, so local numbers
 * will set a budget that fails the moment it lands. Read the actuals off a
 * recent green run of this workflow on main.
 *
 * Baseline (2026-09-02, ubuntu-latest, over gzip), measured after the booking
 * stack left the boot path:
 *   desktop  LCP ~2.01s, FCP ~1.41s, script transfer 976,450 bytes
 *   mobile   LCP ~8.27s, FCP ~6.28s
 * The immediately preceding main was ~984,700 bytes, so that change is worth
 * ~8 KB of real transfer.
 *
 * Recalibrated 2026-09-04: main measured 990,400 bytes, 400 over the old
 * 990 KB budget, after a day of booking and billing merges. The 1,000 KB
 * script budget left ~10 KB of headroom.
 *
 * Recalibrated 2026-09-07: main measured 1,034,338 bytes after react-toastify
 * 9 → 11 (boot-path CompassProvider) and the multi-provider UI. The 1,060 KB
 * script budget leaves ~25 KB of headroom, still far under the ~170 KB gz
 * editor stack (TipTap/react-datepicker/react-select), so a static re-import
 * of the event form still fails the gate. Script transfer is
 * near-deterministic (runs vary by tens of bytes), so it can sit this tight;
 * the paint metrics vary by runner and get much wider headroom.
 *
 * Recalibrated 2026-09-21: main measured 1,064,054 bytes (median of 3 runs on
 * ubuntu-latest; run 35654521880) after keyboard v1 and boot-path work landed
 * without a budget update. perf(web) per-icon Phosphor imports (#3938) dropped
 * transfer from a ~1,077,733 byte spike (#3934) but left ~4 KB over the old
 * 1,060 KB ceiling. perf(sync) mongo warm (#3939) re-triggered this workflow
 * via packages/core and bun.lock only; script transfer matched #3938 within
 * tens of bytes. The 1,065 KB script budget leaves ~1 KB of headroom at the
 * measured median; boot-set gzip (~647 KB locally) is unchanged in intent.
 *
 * Note 2026-09-13: not recalibrated. Lazy-splitting three closed dialogs
 * (#3704) added three dynamic roots, and Bun keys chunks on the set of roots
 * that reach a module, so shared boot modules fragmented into 15 extra
 * chunks that boot still imports. The gzipped content did shrink ~7 KB, but
 * each extra response costs ~0.9 KB of headers and chunked-encoding framing
 * over the HTTP/1.1 serve here, which Lighthouse counts as transfer: net
 * +7 KB and ~450 ms of mobile LCP, so the split was reverted. Near this
 * budget the lever is request count, not module bytes: a new import() only
 * pays when its exclusive graph is large (the event form) and it shares
 * little with boot. Judge a candidate split by the "boot chunks
 * modulepreloaded" count build.ts prints before trusting raw size.
 */
import { mkdirSync } from "node:fs";

const LIGHTHOUSE_VERSION = "13.4.1";
const URL_UNDER_TEST = process.env.PERF_URL || "http://localhost:9161/";
const RUNS = 3;
const REPORT_DIR = "perf-reports";

/** [label, budget, unit, level] - level "error" fails the job, "warn" logs. */
const DESKTOP_BUDGETS = [
  {
    metric: "lcp",
    label: "Largest Contentful Paint",
    max: 2500,
    unit: "ms",
    level: "error",
  },
  {
    metric: "fcp",
    label: "First Contentful Paint",
    max: 1600,
    unit: "ms",
    level: "warn",
  },
  {
    metric: "scriptBytes",
    label: "Script transfer size",
    max: 1_065_000,
    unit: "bytes",
    level: "error",
  },
] as const;

// Warn-only for now: this profile has no track record on CI runners, and its
// job is to make the mobile number visible on main and nightly rather than to block.
// Tighten and promote to "error" once a few runs establish its variance.
const MOBILE_BUDGETS = [
  {
    metric: "lcp",
    label: "Largest Contentful Paint",
    max: 9000,
    unit: "ms",
    level: "warn",
  },
  {
    metric: "fcp",
    label: "First Contentful Paint",
    max: 6800,
    unit: "ms",
    level: "warn",
  },
] as const;

/**
 * `preset` is passed to Lighthouse verbatim; omitting it selects Lighthouse's
 * own default, which is the throttled mobile profile.
 */
const PROFILES = [
  { name: "desktop", preset: "desktop", budgets: DESKTOP_BUDGETS },
  { name: "mobile", preset: undefined, budgets: MOBILE_BUDGETS },
] as const;

interface RunMetrics {
  lcp: number;
  fcp: number;
  scriptBytes: number;
}

interface LighthouseReport {
  audits: Record<
    string,
    {
      numericValue?: number;
      errorMessage?: string;
      details?: {
        items?: Array<{ resourceType?: string; transferSize?: number }>;
      };
    }
  >;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function runLighthouse(
  profileName: string,
  preset: string | undefined,
  runIndex: number,
): Promise<RunMetrics> {
  const reportPath = `${REPORT_DIR}/${profileName}-run-${runIndex}.json`;
  const proc = Bun.spawn(
    [
      "npx",
      "--yes",
      `lighthouse@${LIGHTHOUSE_VERSION}`,
      URL_UNDER_TEST,
      ...(preset ? [`--preset=${preset}`] : []),
      "--only-categories=performance",
      "--output=json",
      `--output-path=${reportPath}`,
      "--chrome-flags=--headless=new --no-sandbox",
      "--quiet",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );

  if ((await proc.exited) !== 0) {
    throw new Error(
      `Lighthouse ${profileName} run ${runIndex} exited non-zero`,
    );
  }

  const report = (await Bun.file(reportPath).json()) as LighthouseReport;
  const lcpAudit = report.audits["largest-contentful-paint"];
  const fcpAudit = report.audits["first-contentful-paint"];

  if (typeof lcpAudit?.numericValue !== "number") {
    throw new Error(
      `${profileName} run ${runIndex} produced no LCP value (${lcpAudit?.errorMessage ?? "unknown error"})`,
    );
  }
  if (typeof fcpAudit?.numericValue !== "number") {
    throw new Error(`${profileName} run ${runIndex} produced no FCP value`);
  }

  const scriptRow = report.audits["resource-summary"]?.details?.items?.find(
    (item) => item.resourceType === "script",
  );

  return {
    lcp: lcpAudit.numericValue,
    fcp: fcpAudit.numericValue,
    scriptBytes: scriptRow?.transferSize ?? 0,
  };
}

mkdirSync(REPORT_DIR, { recursive: true });

let failed = false;

for (const profile of PROFILES) {
  const runs: RunMetrics[] = [];
  for (let i = 1; i <= RUNS; i++) {
    console.log(
      `\nLighthouse ${profile.name} run ${i}/${RUNS} against ${URL_UNDER_TEST}...`,
    );
    runs.push(await runLighthouse(profile.name, profile.preset, i));
  }

  const medians: RunMetrics = {
    lcp: median(runs.map((r) => r.lcp)),
    fcp: median(runs.map((r) => r.fcp)),
    scriptBytes: median(runs.map((r) => r.scriptBytes)),
  };

  console.log(`\n${profile.name} performance budget (median of ${RUNS} runs):`);
  for (const budget of profile.budgets) {
    const value = medians[budget.metric];
    const overBudget = value > budget.max;
    const status = overBudget
      ? budget.level === "error"
        ? "FAIL"
        : "WARN"
      : "ok";
    const all = runs.map((r) => Math.round(r[budget.metric])).join(", ");

    console.log(
      `  [${status}] ${budget.label}: ${Math.round(value)} ${budget.unit}` +
        ` (budget ${budget.max} ${budget.unit}; runs: ${all})`,
    );
    if (overBudget && budget.level === "error") {
      failed = true;
    }
  }
}

if (failed) {
  console.error("\nPerformance budget exceeded.");
  process.exit(1);
}
console.log("\nPerformance budget met.");
