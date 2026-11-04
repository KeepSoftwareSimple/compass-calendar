import {
  describeExhaustedPorts,
  findNextPorts,
  readPorts,
  reassignPorts,
  type SiblingClaim,
} from "@scripts/commands/dev-ports";
import { parseWorktreeList } from "@scripts/commands/dev-ports-shared";
import { describe, expect, it } from "bun:test";

const SAMPLE_YAML = `# Compass Config
# hand-written setup notes live here

runtime:
  nodeEnv: development
  timezone: Etc/UTC

web:
  port: 9080
  url: http://localhost:9080

backend:
  port: 3000
  apiUrl: http://localhost:3000/api
  originsAllowed:
    - http://localhost:3000
    - http://localhost:9080
    - https://staging.example.com
  compassToken: super-secret-token

mongo:
  # keep this uri pointed at the dev cluster
  uri: mongodb+srv://admin:s3cret@cluster0.example.mongodb.net/dev_calendar
`;

describe("readPorts", () => {
  it("reads configured ports", () => {
    expect(readPorts(SAMPLE_YAML)).toEqual({ web: 9080, backend: 3000 });
  });

  it("falls back to defaults when ports are missing", () => {
    expect(readPorts("web:\n  url: http://localhost:9080\n")).toEqual({
      web: 9080,
      backend: 3000,
    });
  });

  it("returns null for malformed yaml", () => {
    expect(readPorts("{{ not yaml")).toBeNull();
  });
});

describe("reassignPorts", () => {
  const next = { web: 9081, backend: 3001 };

  it("rewrites ports, urls, and localhost origins consistently", () => {
    const result = reassignPorts(SAMPLE_YAML, next);

    expect(result).toContain("port: 9081");
    expect(result).toContain("url: http://localhost:9081");
    expect(result).toContain("port: 3001");
    expect(result).toContain("apiUrl: http://localhost:3001/api");
    expect(result).toContain("- http://localhost:3001");
    expect(result).toContain("- http://localhost:9081");
    expect(result).not.toContain("9080");
    expect(result).not.toContain(": 3000");
  });

  it("preserves comments, secrets, and non-localhost origins", () => {
    const result = reassignPorts(SAMPLE_YAML, next);

    expect(result).toContain("# hand-written setup notes live here");
    expect(result).toContain("# keep this uri pointed at the dev cluster");
    expect(result).toContain("compassToken: super-secret-token");
    expect(result).toContain(
      "mongodb+srv://admin:s3cret@cluster0.example.mongodb.net/dev_calendar",
    );
    expect(result).toContain("- https://staging.example.com");
  });

  it("bails when apiUrl is customized (e.g. a tunnel)", () => {
    const customized = SAMPLE_YAML.replace(
      "apiUrl: http://localhost:3000/api",
      "apiUrl: https://example.trycloudflare.com/api",
    );
    expect(reassignPorts(customized, next)).toBeNull();
  });

  it("bails when web.url is customized", () => {
    const customized = SAMPLE_YAML.replace(
      "url: http://localhost:9080",
      "url: https://compass.example.com",
    );
    expect(reassignPorts(customized, next)).toBeNull();
  });
});

// One idle sibling claim per offset, so every one of the 50 candidates is
// claimed by some worktree's compass.yaml.
const exhaustingClaims: SiblingClaim[] = Array.from({ length: 50 }, (_, i) => ({
  worktree: `/worktrees/wt-${i + 1}`,
  ports: { web: 9081 + i, backend: 3001 + i },
  syncPort: null,
}));

const boundOnly =
  (bound: number[]) =>
  async (port: number): Promise<boolean> =>
    !bound.includes(port);

describe("findNextPorts", () => {
  it("skips claimed offsets while a free one remains", async () => {
    const claims = exhaustingClaims.slice(0, 2);
    expect(await findNextPorts(claims, boundOnly([]))).toEqual({
      web: 9083,
      backend: 3003,
    });
  });

  it("skips offsets whose backend port is a sibling's sync port", async () => {
    const claims: SiblingClaim[] = [
      { worktree: "/a", ports: { web: 9081, backend: 3001 }, syncPort: 3002 },
    ];
    expect(await findNextPorts(claims, boundOnly([]))).toEqual({
      web: 9083,
      backend: 3003,
    });
  });

  it("reuses offsets held by idle worktrees once every offset is claimed", async () => {
    expect(await findNextPorts(exhaustingClaims, boundOnly([]))).toEqual({
      web: 9081,
      backend: 3001,
    });
  });

  it("still respects claims from running worktrees", async () => {
    expect(await findNextPorts(exhaustingClaims, boundOnly([9081]))).toEqual({
      web: 9082,
      backend: 3002,
    });
  });

  it("gives up when every offset is held by a running worktree", async () => {
    const bound = exhaustingClaims.map((c) => c.ports.web);
    expect(await findNextPorts(exhaustingClaims, boundOnly(bound))).toBeNull();
  });
});

describe("describeExhaustedPorts", () => {
  it("names the running worktrees that hold claims", () => {
    const message = describeExhaustedPorts([
      {
        worktree: "/wt/a",
        ports: { web: 9081, backend: 3001 },
        syncPort: 3010,
      },
    ]);
    expect(message).toContain("/wt/a (web 9081, backend 3001, sync 3010)");
  });

  it("says when no sibling worktree is the holder", () => {
    expect(describeExhaustedPorts([])).toContain("bound by other processes");
  });
});

describe("parseWorktreeList", () => {
  it("skips worktrees git marks prunable", () => {
    const output = [
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /repo/.claude/worktrees/gone",
      "HEAD def",
      "detached",
      "prunable gitdir file points to non-existent location",
      "",
      "worktree /repo/.claude/worktrees/live",
      "HEAD 123",
      "branch refs/heads/feat",
      "",
    ].join("\n");
    expect(parseWorktreeList(output)).toEqual([
      "/repo",
      "/repo/.claude/worktrees/live",
    ]);
  });
});
