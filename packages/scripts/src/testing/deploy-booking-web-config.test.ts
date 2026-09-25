import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PATCH_SCRIPT = ".github/scripts/deploy-patch-booking-web-yaml.py";

async function runPatch(input: string, args: { image: string; port?: string }) {
  const proc = Bun.spawn(
    [
      "python3",
      PATCH_SCRIPT,
      "--image",
      args.image,
      "--port",
      args.port ?? "9082",
    ],
    {
      cwd: process.cwd(),
      stdin: new Blob([input]),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stderr, stdout };
}

describe("deploy booking-web config", () => {
  it("binds SSH and Docker Hub secrets in the booking-web deploy workflow", () => {
    const workflow = readFileSync(
      ".github/workflows/_deploy-booking-web-environment.yml",
      "utf8",
    );
    expect(workflow).toContain(
      "SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}",
    );
    expect(workflow).toContain("secrets.DOCKERHUB_USERNAME");
    expect(workflow).toContain("deploy-patch-booking-web-yaml.py");
    expect(workflow).toContain("deploy-overlay");
    expect(workflow).toContain("Use booking-web Dockerfile from workflow ref");
    expect(workflow).not.toContain("raw.githubusercontent.com");
    expect(workflow).not.toContain("MONGO_URI");
    expect(workflow).not.toContain("SUPERTOKENS_KEY");
  });

  it("does not rewrite the full compass.yaml during booking-web deploy", () => {
    const workflow = readFileSync(
      ".github/workflows/_deploy-booking-web-environment.yml",
      "utf8",
    );
    expect(workflow).toContain("cat ~/compass/compass.yaml");
    expect(workflow).toContain("./compass update-booking-web");
    expect(workflow).not.toMatch(/\.\/compass update[^-\n]/);
    expect(workflow).toContain("DEPLOY_PROFILES=");
    expect(workflow).toContain("booking,sync");
  });

  it("exposes a manual staging booking-web workflow that leaves calendar deploy alone", () => {
    const workflow = readFileSync(
      ".github/workflows/deploy-staging-booking-web.yml",
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain(
      "uses: ./.github/workflows/_deploy-booking-web-environment.yml",
    );
    expect(workflow).toContain("environment: staging-cloud");
    expect(workflow).not.toContain("_deploy-environment.yml");
  });

  it("exposes a manual production booking-web workflow", () => {
    const workflow = readFileSync(
      ".github/workflows/deploy-production-booking-web.yml",
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain(
      "uses: ./.github/workflows/_deploy-booking-web-environment.yml",
    );
    expect(workflow).toContain("environment: production");
    expect(workflow).not.toContain("_deploy-environment.yml");
  });

  it("inserts bookingWeb after the web block when missing", async () => {
    const input = [
      "runtime:",
      "  version: 1.0.0",
      "web:",
      "  port: 9080",
      "  url: https://staging.example.com",
      "backend:",
      "  port: 3000",
    ].join("\n");
    const result = await runPatch(input, {
      image: "switchbacktech/compass-booking-web:staging-cloud-1.0.0",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("bookingWeb:");
    expect(result.stdout).toContain(
      'image: "switchbacktech/compass-booking-web:staging-cloud-1.0.0"',
    );
    expect(result.stdout).toContain("port: 9082");
    expect(result.stdout.indexOf("bookingWeb:")).toBeGreaterThan(
      result.stdout.indexOf("web:"),
    );
    expect(result.stdout).toContain("backend:");
  });

  it("replaces an existing bookingWeb block without touching other keys", async () => {
    const input = [
      "web:",
      "  port: 9080",
      "bookingWeb:",
      "  port: 9081",
      '  image: "old:tag"',
      "sync:",
      "  serviceUrl: http://sync:3010",
    ].join("\n");
    const result = await runPatch(input, {
      image: "switchbacktech/compass-booking-web:staging-cloud-2.0.0",
      port: "9082",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("old:tag");
    expect(result.stdout).toContain("port: 9082");
    expect(result.stdout).toContain("sync:");
    expect(result.stdout).toContain("serviceUrl: http://sync:3010");
  });
});

describe("compass update-booking-web", () => {
  it("pulls only booking-web and checks its HTTP port", () => {
    const helper = readFileSync(
      join(process.cwd(), "self-host/compass"),
      "utf8",
    );
    const block = helper.slice(helper.indexOf("update-booking-web)"));
    expect(block).toContain("compose pull booking-web");
    expect(block).toContain("compose up -d booking-web --wait");
    expect(block).not.toContain("compose pull ||");
    expect(block).toContain("bookingWeb.image");
    expect(block).toContain("/meet/");
    expect(block).toContain("compose port booking-web 9081");
    expect(block).toContain("booking_host_port");
  });
});
