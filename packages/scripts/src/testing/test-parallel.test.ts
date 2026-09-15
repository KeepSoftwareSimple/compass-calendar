import {
  parallelArgsFor,
  selectWebShards,
  shardTargets,
  testArgvFor,
  webSuiteShardCount,
  webSuiteShardIndex,
} from "./test-parallel";
import { describe, expect, it } from "bun:test";

const argvOpts = {
  preloadPath: "packages/web/src/__tests__/web.preload.ts",
  bunFlags: [] as string[],
  targets: ["./packages/web/src"],
};

describe("parallelArgsFor", () => {
  it("omits --parallel for the web profile", () => {
    expect(parallelArgsFor("web")).toEqual([]);
  });

  it("keeps --parallel for mongo-free non-web profiles", () => {
    expect(parallelArgsFor("core")).toEqual(["--parallel"]);
    expect(parallelArgsFor("backend-fast")).toEqual(["--parallel"]);
  });
});

describe("testArgvFor", () => {
  it("does not pass --parallel when the web profile builds argv", () => {
    expect(testArgvFor("web", argvOpts)).not.toContain("--parallel");
  });

  it("passes --parallel for core", () => {
    expect(
      testArgvFor("core", {
        ...argvOpts,
        preloadPath: "packages/scripts/src/testing/core.preload.ts",
        targets: ["./packages/core/src"],
      }),
    ).toContain("--parallel");
  });
});

describe("shardTargets", () => {
  it("keeps a single shard when count is 1", () => {
    expect(shardTargets(["a", "b", "c"], 1)).toEqual([["a", "b", "c"]]);
  });

  it("splits files into contiguous shards", () => {
    expect(shardTargets(["a", "b", "c", "d"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("does not emit empty shards when the count exceeds the file count", () => {
    expect(shardTargets(["a", "b"], 4)).toEqual([["a"], ["b"]]);
  });
});

describe("webSuiteShardCount", () => {
  it("stays on one process for an explicit path focus", () => {
    expect(webSuiteShardCount({ explicitPathCount: 1 })).toBe(1);
  });

  it("defaults the full suite to six processes", () => {
    expect(webSuiteShardCount({ explicitPathCount: 0 })).toBe(6);
  });

  it("honors WEB_TEST_SHARDS when focusing the full suite", () => {
    expect(webSuiteShardCount({ explicitPathCount: 0, envShards: "3" })).toBe(
      3,
    );
  });
});

describe("webSuiteShardIndex", () => {
  it("runs every shard when the index env is unset", () => {
    expect(webSuiteShardIndex({ shardCount: 2 })).toBe("all");
    expect(webSuiteShardIndex({ shardCount: 2, envIndex: "" })).toBe("all");
  });

  it("picks a 1-based shard for CI legs", () => {
    expect(webSuiteShardIndex({ shardCount: 2, envIndex: "2" })).toEqual([2]);
  });

  it("accepts a comma list so one CI leg can run two RSS-safe shards", () => {
    expect(webSuiteShardIndex({ shardCount: 4, envIndex: "3,4" })).toEqual([
      3, 4,
    ]);
  });

  it("rejects an index outside the shard count", () => {
    expect(() => webSuiteShardIndex({ shardCount: 2, envIndex: "3" })).toThrow(
      /1 to 2/,
    );
    expect(() => webSuiteShardIndex({ shardCount: 2, envIndex: "0" })).toThrow(
      /1 to 2/,
    );
  });
});

describe("selectWebShards", () => {
  const shards = [
    ["a", "b"],
    ["c", "d"],
  ];

  it("keeps every shard for local bun test:web", () => {
    expect(selectWebShards(shards, "all")).toEqual([
      { index: 0, shard: ["a", "b"] },
      { index: 1, shard: ["c", "d"] },
    ]);
  });

  it("runs only the second half when WEB_TEST_SHARD_INDEX=2", () => {
    expect(selectWebShards(shards, [2])).toEqual([
      { index: 1, shard: ["c", "d"] },
    ]);
  });

  it("runs two sequential shards from a comma list", () => {
    expect(selectWebShards(shards, [1, 2])).toEqual([
      { index: 0, shard: ["a", "b"] },
      { index: 1, shard: ["c", "d"] },
    ]);
  });
});
