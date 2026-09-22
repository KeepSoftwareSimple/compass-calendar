import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const EMAIL_BLOCK_SCRIPT = ".github/scripts/deploy-write-email-block.sh";

async function runWriteEmailBlock(env: Record<string, string>) {
  const proc = Bun.spawn(
    ["bash", "-c", `. ${EMAIL_BLOCK_SCRIPT}; write_email_block`],
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
});
