import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const HEALTH_CHECK_SCRIPT = ".github/scripts/deploy-health-check.sh";

async function runHealthScriptFunction(
  command: string,
  env: Record<string, string> = {},
) {
  const proc = Bun.spawn(
    ["bash", "-c", `. ${HEALTH_CHECK_SCRIPT}; ${command}`],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SSH_TARGET: "",
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

describe("deploy health check script contract", () => {
  it("joins BACKEND_API_URL onto /config, not /api/config", () => {
    const script = readFileSync(HEALTH_CHECK_SCRIPT, "utf8");

    expect(script).toContain('url="${BACKEND_API_URL%/}/health"');
    expect(script).toContain('url="${BACKEND_API_URL%/}/config"');
    expect(script).not.toContain('url="${BACKEND_API_URL%/}/api/config"');
  });

  it("probes /api/config when BACKEND_API_URL already ends in /api", async () => {
    const requested: string[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        requested.push(path);
        if (path === "/api/config") {
          return Response.json({ version: "0.5.27" });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const result = await runHealthScriptFunction(
        "validate_backend_config_version; exit $?",
        {
          BACKEND_API_URL: `http://127.0.0.1:${server.port}/api`,
          RELEASE_TAG: "v0.5.27",
        },
      );

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ok backend-config-version");
      expect(requested).toEqual(["/api/config"]);
    } finally {
      server.stop(true);
    }
  });
});
