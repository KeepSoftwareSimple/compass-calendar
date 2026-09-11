import {
  POSTHOG_ERROR_TRACKING_PROPERTY,
  posthogErrorTrackingSqlPropertyColumns,
} from "@core/constants/posthog-error-tracking.properties";
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const POSTHOG_ERROR_TRACKING_CONSTANTS_PATH =
  "packages/core/src/constants/posthog-error-tracking.properties.ts";

// Structural invariants of the error-autofix guard and prompt. Documentation
// prose lives in docs/CI-CD/error-autofix-routine.md and is not pinned here.
describe("error-autofix Routine contract", () => {
  it("ships the workflows and Routine doc", () => {
    const workflows = readFileSync("docs/CI-CD/workflows.md", "utf8");
    expect(workflows).toContain("error-autofix.yml");
    expect(workflows).toContain("error-autofix-postdeploy.yml");
    expect(workflows).toContain("error-autofix-routine.md");
    expect(existsSync("docs/CI-CD/error-autofix-routine.md")).toBe(true);
    expect(existsSync(".github/prompts/error-autofix.md")).toBe(true);
  });

  it("keeps merge-guard as the Verifier with small size rails", () => {
    const guard = readFileSync(
      ".github/scripts/autofix-merge-guard.sh",
      "utf8",
    );
    expect(guard).not.toContain("NO_AUTOMERGE_PATH_PATTERNS");
    expect(guard).toMatch(/^MAX_FILES=8$/m);
    expect(guard).toMatch(/^MAX_LINES=250$/m);
  });

  it("enables auto-merge with a token that has contents:write", () => {
    // AUTOFIX_GITHUB_TOKEN alone failed every gate with "Resource not
    // accessible by personal access token (enablePullRequestAutoMerge)"
    // (2026-09-06, PR #3450); the agent-loop PAT carries both scopes.
    const workflow = readFileSync(
      ".github/workflows/error-autofix.yml",
      "utf8",
    );
    expect(workflow).toContain(
      "GH_TOKEN: ${{ secrets.AGENT_LOOP_GITHUB_TOKEN || secrets.AUTOFIX_GITHUB_TOKEN }}",
    );
    const guard = readFileSync(
      ".github/scripts/autofix-merge-guard.sh",
      "utf8",
    );
    // The notice carries gh's own error so a token failure reads from Discord.
    expect(guard).toMatch(/merge_error=\$\(gh pr merge[^\n]*--auto 2>&1\)/);
  });

  it("does not refuse auto-merge by path prefix", () => {
    const guard = readFileSync(
      ".github/scripts/autofix-merge-guard.sh",
      "utf8",
    );
    expect(guard).not.toContain("NO_AUTOMERGE_PATH_PATTERNS");
  });

  it("lets the agent author a fix without a path-based human flag", () => {
    const prompt = readFileSync(".github/prompts/error-autofix.md", "utf8");
    expect(prompt).not.toContain("Never edit any denied path");
    expect(prompt).not.toContain(
      "never add `automerge-candidate`, in any mode",
    );
    expect(prompt).not.toContain(".agents/handoffs");
  });

  it("re-enters the loop on recurrence, failed runs, and the sweep", () => {
    const workflow = readFileSync(
      ".github/workflows/error-autofix.yml",
      "utf8",
    );
    expect(workflow).toContain("types: [opened, reopened]");
    expect(workflow).toContain('cron: "17 * * * *"');
    expect(workflow).toContain("Sweep production exceptions into autofix");
    expect(workflow).toContain("autofix-sweep.sh");
    expect(workflow).toContain("autofix-unstick.sh");
    expect(workflow).toContain("failure() && steps.agent.outcome == 'failure'");
    expect(workflow).toContain("needs.autofix.result == 'success'");
    expect(existsSync(".github/scripts/autofix-sweep.sh")).toBe(true);
    expect(existsSync(".github/scripts/autofix-unstick.sh")).toBe(true);

    const unit = readFileSync(".github/workflows/test-unit.yml", "utf8");
    expect(unit).toContain("bash .github/scripts/autofix-preflight.test.sh");
    expect(unit).toContain("bash .github/scripts/autofix-unstick.test.sh");
    expect(unit).toContain("bash .github/scripts/autofix-sweep.test.sh");
    expect(unit).toContain("bash .github/scripts/autofix-lib.test.sh");

    const prompt = readFileSync(".github/prompts/error-autofix.md", "utf8");
    expect(prompt).toContain("Recurrence on an already-seen fingerprint");
    expect(prompt).toContain("error-tracking-issues-partial-update");
    expect(prompt).toContain("Do **not** resolve ops/transient or unknown");

    const postdeploy = readFileSync(
      ".github/scripts/autofix-postdeploy-notify.sh",
      "utf8",
    );
    expect(postdeploy).toContain("resolve_linked_posthog_issue");

    const routine = readFileSync("docs/CI-CD/error-autofix-routine.md", "utf8");
    expect(routine).toContain("Failed agent run");
    expect(routine).toContain("Production recurrence on a closed GitHub issue");
    expect(routine).toContain("Sweep with no GitHub issue");
  });

  it("keeps the autofix prompt aligned with PostHog error property constants", () => {
    const prompt = readFileSync(".github/prompts/error-autofix.md", "utf8");
    expect(prompt).toContain(POSTHOG_ERROR_TRACKING_CONSTANTS_PATH);
    for (const column of posthogErrorTrackingSqlPropertyColumns().split(
      ",\n       ",
    )) {
      expect(prompt).toContain(column.trim());
    }
    for (const name of Object.values(POSTHOG_ERROR_TRACKING_PROPERTY)) {
      expect(prompt).toContain(`properties.${name}`);
    }
  });
});
