import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const JOURNEYS_BLOCK_SCRIPT = ".github/scripts/deploy-write-journeys-block.sh";
const STRIPE_DISCOUNT_SCRIPT =
  ".github/scripts/deploy-write-stripe-synthetic-discount.sh";

async function runWriteStripeSyntheticDiscount(env: Record<string, string>) {
  const proc = Bun.spawn(
    [
      "bash",
      "-c",
      `. ${STRIPE_DISCOUNT_SCRIPT}; write_stripe_synthetic_journey_discount`,
    ],
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

  it("binds STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID in the deploy workflow", () => {
    const workflow = readFileSync(
      ".github/workflows/_deploy-environment.yml",
      "utf8",
    );
    expect(workflow).toContain(
      "STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID: ${{ secrets.STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID }}",
    );
    expect(workflow).toContain("deploy-write-stripe-synthetic-discount.sh");
  });

  it("writes syntheticJourneyDiscountId when STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID is set", async () => {
    const result = await runWriteStripeSyntheticDiscount({
      STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID: "coupon_prod_journey_100",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("synthetic journey discount id configured");
    expect(result.stdout).toContain(
      'syntheticJourneyDiscountId: "coupon_prod_journey_100"',
    );
  });

  it("omits syntheticJourneyDiscountId when STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID is unset", async () => {
    const result = await runWriteStripeSyntheticDiscount({});

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("omitting syntheticJourneyDiscountId");
    expect(result.stdout).toBe("");
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
