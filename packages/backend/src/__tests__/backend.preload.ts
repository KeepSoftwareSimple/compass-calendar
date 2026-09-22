// sort-imports-ignore
import { applyBackendTestEnv } from "@scripts/testing/backend-test-env";

const sharedMongoUri = process.env["COMPASS_TEST_MONGO_URI"];
if (sharedMongoUri) {
  applyBackendTestEnv(sharedMongoUri);
}

// Bun preload for the backend test suite. Ordered, single-process setup:
//   1. Core env (NODE_ENV=test) so CONFIG resolves from env, not compass.yaml.
//   2. Start one in-memory Mongo replica set and publish its URI.
//   3. Backend env (reads the URI) + injectable test seams via backend.test.start.
import "@core/__tests__/core.test.init";
import { afterAll } from "bun:test";

// test-mongo-env.ts boots one shared mongod and passes COMPASS_TEST_MONGO_URI.
// Do not statically import mongodb-memory-server in that mode: parallel workers
// loading follow-redirects/assert color setup against piped stderr has crashed
// with EEXIST epoll_ctl and poisoned unrelated pure tests (scripts CI).
const uri = sharedMongoUri
  ? sharedMongoUri
  : await (
      await import("@backend/__tests__/helpers/mongo-memory-server")
    ).startMemoryMongo();
(globalThis as typeof globalThis & { __MONGO_URI__: string }).__MONGO_URI__ =
  uri;
process.env["MONGO_URI"] = uri;

await import("@backend/__tests__/backend.test.init");
await import("@backend/__tests__/backend.test.start");

if (!sharedMongoUri) {
  afterAll(async () => {
    const { stopMemoryMongo } = await import(
      "@backend/__tests__/helpers/mongo-memory-server"
    );
    await stopMemoryMongo();
  });
}
