// sort-imports-ignore
// Test preload for @compass/sync. Pins the test environment and starts one
// in-memory Mongo replica set for the process. Storage tests isolate
// themselves with per-test database names.
import { afterAll } from "bun:test";

process.env["NODE_ENV"] = "test";
process.env["LOG_LEVEL"] = "debug";

const sharedMongoUri = process.env["COMPASS_TEST_MONGO_URI"];

const uri = sharedMongoUri
  ? sharedMongoUri
  : await (
      await import("@sync/__tests__/helpers/mongo-memory")
    ).startMemoryMongo();
process.env["SYNC_MONGO_URI"] = uri;

if (!sharedMongoUri) {
  afterAll(async () => {
    const { stopMemoryMongo } = await import(
      "@sync/__tests__/helpers/mongo-memory"
    );
    await stopMemoryMongo();
  });
}
