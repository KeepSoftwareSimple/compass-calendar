import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const JOURNEYS_BLOCK_SCRIPT = ".github/scripts/deploy-write-journeys-block.sh";

async function runWriteJourneysBlock(env: Record<string, string>) {
  const proc = Bun.spawn(
    ["bash", "-c", `. ${JOURNEYS_BLOCK_SCRIPT}; write_journeys_block`],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stderr, stdout };
}

describe("deploy write journeys block", () => {
  it("binds SYNTHETIC_JOURNEY_EMAILS in the deploy workflow", () => {
    const workflow = readFileSync(
      ".github/workflows/_deploy-environment.yml",
      "utf8",
    );
    expect(workflow).toContain(
      "SYNTHETIC_JOURNEY_EMAILS: ${{ vars.SYNTHETIC_JOURNEY_EMAILS }}",
    );
    expect(workflow).toContain("deploy-write-journeys-block.sh");
  });

  it("writes syntheticEmails when SYNTHETIC_JOURNEY_EMAILS is set", async () => {
    const result = await runWriteJourneysBlock({
      SYNTHETIC_JOURNEY_EMAILS: "lance.essert@gmail.com, runner@example.com",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("synthetic journey bases configured");
    expect(result.stdout).toContain("journeys:");
    expect(result.stdout).toContain(
      'syntheticEmails: ["lance.essert@gmail.com","runner@example.com"]',
    );
  });

  it("omits the block when SYNTHETIC_JOURNEY_EMAILS is unset", async () => {
    const result = await runWriteJourneysBlock({});

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("omitting journeys block");
    expect(result.stdout).toBe("");
  });
});
