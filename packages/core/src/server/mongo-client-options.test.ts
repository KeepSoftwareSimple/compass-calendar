import {
  mongoPerformanceOptions,
  supportedMongoCompressors,
} from "@core/server/mongo-client-options";

describe("mongoPerformanceOptions", () => {
  it("warms a small pool and drops idle sockets", () => {
    const options = mongoPerformanceOptions();
    expect(options.minPoolSize).toBe(2);
    expect(options.maxIdleTimeMS).toBe(60_000);
    // zstd first: the driver offers compressors in order and uses the first
    // one the server also supports.
    expect(supportedMongoCompressors()).toEqual(["zstd", "snappy"]);
    expect(options.compressors).toEqual(["zstd", "snappy"]);
  });
});
