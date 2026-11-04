import { parse } from "yaml";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const EMAIL_BLOCK_SCRIPT = ".github/scripts/deploy-write-email-block.sh";
const completeEmailConfig = {
  EMAIL_PROVIDER: "resend",
  EMAIL_API_KEY: "re_test",
  EMAIL_FROM: "Compass <hello@mail.example.com>",
  EMAIL_WEBHOOK_SECRET: "whsec_test",
  EMAIL_UNSUBSCRIBE_SECRET: "unsub-secret",
};

async function runEmailBlockScript(
  command: string,
  env: Record<string, string>,
) {
  const proc = Bun.spawn(
    ["bash", "-c", `. ${EMAIL_BLOCK_SCRIPT}; ${command}`],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        REFLECTION_ENABLED: "",
        REFLECTION_ROLLOUT_ENABLED: "",
        REFLECTION_TRIAL_USER_ID: "",
        REFLECTION_TRIAL_EMAIL: "",
        ...env,
      },
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

async function runWriteEmailBlock(env: Record<string, string>) {
  return runEmailBlockScript("write_email_block", env);
}

async function runRequireProductionEmailConfig(env: Record<string, string>) {
  return runEmailBlockScript("require_production_email_config", env);
}

describe("deploy write email block", () => {
  it("binds email secrets directly in the deploy workflow", () => {
    const workflow = readFileSync(
      ".github/workflows/_deploy-environment.yml",
      "utf8",
    );
    expect(workflow).toContain("EMAIL_API_KEY: ${{ secrets.EMAIL_API_KEY }}");
    expect(workflow).toContain(
      "EMAIL_WEBHOOK_SECRET: ${{ secrets.EMAIL_WEBHOOK_SECRET }}",
    );
    expect(workflow).not.toContain("&& secrets.EMAIL_API_KEY ||");
    expect(workflow).toContain("deploy-write-email-block.sh");
  });

  it("writes a valid email block when resend values are present", async () => {
    const result = await runWriteEmailBlock({
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "re_test",
      EMAIL_FROM: "Compass <hello@mail.example.com>",
      EMAIL_WEBHOOK_SECRET: "whsec_test",
      EMAIL_UNSUBSCRIBE_SECRET: "unsub-secret",
      EMAIL_SCHEDULE_PROFILE: "fast",
      EMAIL_ALLOWLIST: "qa@example.com, founder@example.com",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("writing email block");
    expect(result.stdout).toContain("email:");
    expect(result.stdout).toContain("provider: resend");
    expect(result.stdout).toContain("scheduleProfile: fast");
    expect(result.stdout).toContain(
      'allowlist: ["qa@example.com","founder@example.com"]',
    );
  });

  it("writes preview loop settings when configured", async () => {
    const result = await runWriteEmailBlock({
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "re_test",
      EMAIL_FROM: "Compass <hello@mail.example.com>",
      EMAIL_WEBHOOK_SECRET: "whsec_test",
      EMAIL_UNSUBSCRIBE_SECRET: "unsub-secret",
      EMAIL_PREVIEW_LOOP_RECIPIENTS: "founder@example.com",
      EMAIL_PREVIEW_LOOP_SCHEDULE_PROFILE: "fast",
      EMAIL_PREVIEW_LOOP_GAP_DAYS: "1",
      EMAIL_PREVIEW_LOOP_MAX_PER_DAY: "10",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("previewLoop:");
    expect(result.stdout).toContain('recipients: ["founder@example.com"]');
    expect(result.stdout).toContain("scheduleProfile: fast");
    expect(result.stdout).toContain("gapDays: 1");
    expect(result.stdout).toContain("maxEmailsPerDay: 10");
  });

  it("keeps reflections off when no deploy inputs are configured", async () => {
    const result = await runWriteEmailBlock(completeEmailConfig);
    expect(result.exitCode).toBe(0);
    expect(parse(result.stdout).email.reflection).toBeUndefined();
  });

  it("writes private trial settings without enabling general rollout or logging its binding", async () => {
    const userId = "000000000000000000000123";
    const email = "trial+reflection@example.com";
    const result = await runWriteEmailBlock({
      ...completeEmailConfig,
      REFLECTION_ENABLED: "true",
      REFLECTION_TRIAL_USER_ID: userId,
      REFLECTION_TRIAL_EMAIL: email,
    });
    expect(result.exitCode).toBe(0);
    expect(parse(result.stdout).email.reflection).toEqual({
      enabled: true,
      rolloutEnabled: false,
      trialUserId: userId,
      trialEmail: email,
    });
    expect(result.stderr).not.toContain(userId);
    expect(result.stderr).not.toContain(email);
    const workflow = readFileSync(
      ".github/workflows/_deploy-environment.yml",
      "utf8",
    );
    expect(workflow).toContain(
      "REFLECTION_ENABLED: ${{ vars.REFLECTION_ENABLED }}",
    );
    expect(workflow).toContain(
      "REFLECTION_ROLLOUT_ENABLED: ${{ vars.REFLECTION_ROLLOUT_ENABLED }}",
    );
    expect(workflow).toContain(
      "REFLECTION_TRIAL_USER_ID: ${{ secrets.REFLECTION_TRIAL_USER_ID }}",
    );
    expect(workflow).toContain(
      "REFLECTION_TRIAL_EMAIL: ${{ secrets.REFLECTION_TRIAL_EMAIL }}",
    );
  });

  it("retains an explicit reflection kill switch and rejects invalid flag values", async () => {
    const stopped = await runWriteEmailBlock({
      ...completeEmailConfig,
      REFLECTION_ENABLED: "false",
    });
    expect(stopped.exitCode).toBe(0);
    expect(parse(stopped.stdout).email.reflection).toEqual({
      enabled: false,
      rolloutEnabled: false,
    });
    const invalid = await runWriteEmailBlock({
      ...completeEmailConfig,
      REFLECTION_ENABLED: "yes",
    });
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain(
      "REFLECTION_ENABLED must be true or false",
    );
  });

  it("omits the block and logs missing values when secrets are absent", async () => {
    const result = await runWriteEmailBlock({
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "",
      EMAIL_FROM: "Compass <hello@mail.example.com>",
      EMAIL_WEBHOOK_SECRET: "",
      EMAIL_UNSUBSCRIBE_SECRET: "",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("omitting email block");
    expect(result.stderr).toContain("apiKey=empty");
    expect(result.stderr).toContain("webhookSecret=empty");
  });

  it("fails production deploy when resend email secrets are missing", async () => {
    const result = await runRequireProductionEmailConfig({
      DEPLOY_ENVIRONMENT: "production",
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "Compass <hello@mail.example.com>",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Production deploy requires");
    expect(result.stderr).toContain("EMAIL_API_KEY");
  });

  it("fails production deploy when EMAIL_ALLOWLIST is set", async () => {
    const result = await runRequireProductionEmailConfig({
      DEPLOY_ENVIRONMENT: "production",
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "re_test",
      EMAIL_FROM: "Compass <hello@mail.example.com>",
      EMAIL_WEBHOOK_SECRET: "whsec_test",
      EMAIL_UNSUBSCRIBE_SECRET: "unsub-secret",
      EMAIL_ALLOWLIST: "qa@example.com",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("must not set EMAIL_ALLOWLIST");
  });

  it("allows staging-cloud deploy when email secrets are present", async () => {
    const result = await runRequireProductionEmailConfig({
      DEPLOY_ENVIRONMENT: "staging-cloud",
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "re_test",
      EMAIL_FROM: "Compass <hello@mail.example.com>",
      EMAIL_WEBHOOK_SECRET: "whsec_test",
      EMAIL_UNSUBSCRIBE_SECRET: "unsub-secret",
      EMAIL_ALLOWLIST: "qa@example.com",
    });

    expect(result.exitCode).toBe(0);
  });
});
