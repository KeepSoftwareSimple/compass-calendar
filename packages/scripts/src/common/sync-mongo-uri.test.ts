import { resolveSyncMongoUri } from "@scripts/common/sync-mongo-uri";
import { afterEach, describe, expect, it } from "bun:test";

describe("resolveSyncMongoUri", () => {
  const original = process.env["SYNC_MONGO_URI"];

  afterEach(() => {
    if (original === undefined) {
      delete process.env["SYNC_MONGO_URI"];
    } else {
      process.env["SYNC_MONGO_URI"] = original;
    }
  });

  it("prefers SYNC_MONGO_URI over compass.yaml", () => {
    process.env["SYNC_MONGO_URI"] = " mongodb://localhost:27017/sync ";
    expect(resolveSyncMongoUri("connection-report")).toBe(
      "mongodb://localhost:27017/sync",
    );
  });
});
