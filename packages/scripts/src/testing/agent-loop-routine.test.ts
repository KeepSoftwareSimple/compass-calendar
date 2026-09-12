import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

// Structural invariants of the agent-loop scripts and workflow. Each one
// encodes an incident (see docs/CI-CD/loop-velocity-2026-09-03.md); none pin
// documentation prose, which lives in docs/CI-CD/agent-loop-routine.md.
describe("agent-loop Routine contract", () => {
  it("ships the workflow, prompt, Routine doc, and scripts", () => {
    expect(existsSync("docs/CI-CD/agent-loop-routine.md")).toBe(true);
    expect(existsSync(".github/workflows/agent-loop.yml")).toBe(true);
    expect(existsSync(".github/prompts/agent-loop.md")).toBe(true);
    const workflows = readFileSync("docs/CI-CD/workflows.md", "utf8");
    expect(workflows).toContain("agent-loop.yml");
    expect(workflows).toContain("agent-loop-routine.md");
  });

  it("enables GitHub auto-merge instead of holding a runner on CI", () => {
    const guard = readFileSync(
      ".github/scripts/agent-loop-merge-guard.sh",
      "utf8",
    );
    expect(guard).toMatch(
      /gh pr merge "\$pr_number" --repo "\$REPO" --auto 2>&1\)/,
    );
    // The merge queue rejects an explicit strategy or branch deletion.
    expect(guard).not.toMatch(/gh pr merge[^\n]*(--squash|--delete-branch)/);
    expect(guard).not.toContain("gh pr checks");
    expect(guard).toContain("main_is_red");
    expect(guard).toContain("--disable-auto");
  });

  it("does not refuse auto-merge by path prefix", () => {
    const guard = readFileSync(
      ".github/scripts/agent-loop-merge-guard.sh",
      "utf8",
    );
    expect(guard).not.toContain("NO_AUTOMERGE_PATH_PATTERNS");
    expect(guard).not.toContain("evaluate_paths");
    const unit = readFileSync(".github/workflows/test-unit.yml", "utf8");
    expect(unit).toContain("rhysd/actionlint");
    // The step loops over every `*.test.sh` rather than naming them, so the
    // contract is the loop plus the file being there to be picked up.
    expect(unit).toContain("for script_test in .github/scripts/*.test.sh");
    expect(existsSync(".github/scripts/agent-loop-merge-guard.test.sh")).toBe(
      true,
    );
  });

  it("launches the next WP on merge with per-job concurrency", () => {
    const workflow = readFileSync(".github/workflows/agent-loop.yml", "utf8");
    expect(workflow).toContain("github.event.pull_request.merged == true");
    expect(workflow).toContain(
      "group: agent-merge-${{ github.event.pull_request.number }}",
    );
    // A workflow-level group once queued every merge-guard behind every
    // launch and cancelled 56 runs in a day.
    expect(workflow).not.toMatch(/^concurrency:/m);
    expect(workflow).toContain("cancel-in-progress: false");
    const postdeploy = readFileSync(
      ".github/scripts/agent-loop-postdeploy.sh",
      "utf8",
    );
    expect(postdeploy).not.toContain("launch_next");
    expect(workflow).not.toContain("unlabeled");
    const postDeployJob =
      workflow.split("  kick:")[0]?.split("  post-deploy:")[1] ?? "";
    expect(postDeployJob).toContain("agent-loop-postdeploy.sh");
    expect(postDeployJob).not.toContain("agent-loop-next.sh");
    expect(postDeployJob).not.toContain("agent-loop-launch.sh");
    expect(workflow).toContain("vars.AGENT_LOOP_ENABLED == 'true'");
    expect(workflow).not.toContain("BOOKING_LOOP_ENABLED");
    expect(workflow).not.toContain("booking-automerge");
  });

  it("launches only via the Cursor API", () => {
    const launch = readFileSync(".github/scripts/agent-loop-launch.sh", "utf8");
    expect(launch).toContain("https://api.cursor.com/v0/agents");
    expect(launch).toContain('if [ -z "${CURSOR_API_KEY:-}" ]');
    expect(launch).toContain('if [ "$http_code" = "429" ]');
    expect(launch).not.toContain("agent-loop: pickup");
    expect(launch).not.toContain("LEGACY_PICKUP_PHRASE");
    expect(launch).not.toContain("ship/SKILL.md");
    const next = readFileSync(".github/scripts/agent-loop-next.sh", "utf8");
    expect(next).toContain("is_human_approval");
    expect(next).toContain("has_open_dependency");
    expect(next).toContain("AGENT_LOOP_MILESTONES is empty; idle.");
    const prompt = readFileSync(".github/prompts/agent-loop.md", "utf8");
    expect(prompt).not.toContain("ship/SKILL.md");
    expect(prompt).not.toContain("BOOKING_LOOP_ENABLED");
    const review = readFileSync(".github/workflows/agent-review.yml", "utf8");
    expect(review).toContain("workflow_dispatch");
    expect(review).not.toMatch(/^ {2}pull_request:/m);
  });

  it("runs up to AGENT_LOOP_CONCURRENCY issues from different partitions", () => {
    const launch = readFileSync(".github/scripts/agent-loop-launch.sh", "utf8");
    expect(launch).toContain("different partitions");
    const next = readFileSync(".github/scripts/agent-loop-next.sh", "utf8");
    expect(next).toContain("AGENT_LOOP_CONCURRENCY");
    expect(next).toContain("PARTITION_LABELS");
    expect(next).toContain("issue_numbers");
    const workflow = readFileSync(".github/workflows/agent-loop.yml", "utf8");
    expect(workflow).toContain("AGENT_LOOP_CONCURRENCY");
    expect(workflow).toContain("steps.next.outputs.issue_numbers");
  });

  it("lets the merge queue drive the required test workflows", () => {
    const unit = readFileSync(".github/workflows/test-unit.yml", "utf8");
    const e2e = readFileSync(".github/workflows/test-e2e.yml", "utf8");
    expect(unit).toMatch(/^ {2}merge_group:$/m);
    expect(e2e).toMatch(/^ {2}merge_group:$/m);
  });

  it("requeues conflicted automerge PRs without needs-human", () => {
    const guard = readFileSync(
      ".github/scripts/agent-loop-merge-guard.sh",
      "utf8",
    );
    expect(guard).toContain("close_and_requeue");
    expect(guard).toContain("try_update_branch");
    expect(guard).toContain("gh pr update-branch");
    expect(guard).toContain("still conflicting after update-branch onto main");
    expect(guard).toContain("Issue stays \\`${READY_LABEL}\\`");
    expect(guard).not.toContain("BOOKING_LOOP_");
    expect(guard).not.toContain("LEGACY_");
  });

  it("smokes staging without logging in", () => {
    const smoke = readFileSync(
      ".github/scripts/agent-loop-staging-smoke.sh",
      "utf8",
    );
    expect(smoke).toContain("https://staging.compasscalendar.com");
    expect(smoke).not.toContain("password");
    expect(smoke).not.toContain("oauth");
  });
});
