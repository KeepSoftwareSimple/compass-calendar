import {
  isTransientMongoNetworkError,
  withTransientMongoRetry,
} from "./mongo-network-error.util";
import { describe, expect, it, mock } from "bun:test";

function namedError(name: string, message: string, cause?: Error): Error {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = name;
  return error;
}

describe("isTransientMongoNetworkError", () => {
  it("matches Mongo driver network and pool-cleared error names", () => {
    expect(
      isTransientMongoNetworkError(
        namedError(
          "PoolClearedOnNetworkError",
          "Connection to host:27017 interrupted due to server monitor timeout",
        ),
      ),
    ).toBe(true);
    expect(
      isTransientMongoNetworkError(
        namedError("MongoNetworkError", "getaddrinfo ESERVFAIL"),
      ),
    ).toBe(true);
  });

  it("matches DNS and socket blip messages even without a driver name", () => {
    expect(
      isTransientMongoNetworkError(new Error("getaddrinfo ESERVFAIL foo")),
    ).toBe(true);
    expect(isTransientMongoNetworkError(new Error("read ECONNRESET"))).toBe(
      true,
    );
    expect(
      isTransientMongoNetworkError(
        new Error("connection 15 to 35.193.60.195:27017 closed"),
      ),
    ).toBe(true);
  });

  it("matches a named MongoNetworkError for a closed pooled connection", () => {
    expect(
      isTransientMongoNetworkError(
        namedError(
          "MongoNetworkError",
          "connection 15 to 35.193.60.195:27017 closed",
        ),
      ),
    ).toBe(true);
  });

  it("matches server selection only when the cause/message is a network blip", () => {
    expect(
      isTransientMongoNetworkError(
        namedError(
          "MongoServerSelectionError",
          "Server selection timed out after 30000 ms",
          namedError("MongoNetworkError", "getaddrinfo ESERVFAIL"),
        ),
      ),
    ).toBe(true);

    // Durable selection failures (allowlist / no primary / etc.) must still page.
    expect(
      isTransientMongoNetworkError(
        namedError(
          "MongoServerSelectionError",
          "Server selection timed out after 30000 ms",
        ),
      ),
    ).toBe(false);
    expect(
      isTransientMongoNetworkError(
        namedError("MongoServerSelectionError", "connection timed out"),
      ),
    ).toBe(false);
  });

  it("matches a connection pool checkout timeout under CSOT", () => {
    // MongoOperationTimeoutError wrapping a MongoWaitQueueTimeoutError, as
    // thrown by ConnectionPool#checkOut when the wait queue times out.
    expect(
      isTransientMongoNetworkError(
        namedError(
          "MongoOperationTimeoutError",
          "Timed out during connection checkout",
          namedError(
            "MongoWaitQueueTimeoutError",
            "Timed out while checking out a connection from connection pool",
          ),
        ),
      ),
    ).toBe(true);

    // The unwrapped wait-queue error alone (non-CSOT driver versions).
    expect(
      isTransientMongoNetworkError(
        namedError(
          "MongoWaitQueueTimeoutError",
          "Timed out while checking out a connection from connection pool",
        ),
      ),
    ).toBe(true);
  });

  it("rejects unrelated failures", () => {
    expect(
      isTransientMongoNetworkError(new Error("database unavailable")),
    ).toBe(false);
    expect(isTransientMongoNetworkError("not an error")).toBe(false);
    expect(isTransientMongoNetworkError(null)).toBe(false);
  });
});

describe("withTransientMongoRetry", () => {
  it("returns on the first success", async () => {
    const operation = mock(() => Promise.resolve("ok"));
    await expect(
      withTransientMongoRetry(operation, { attempts: 3 }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries transient Mongo blips then succeeds", async () => {
    const sleep = mock((_ms: number) => Promise.resolve());
    const operation = mock(() => Promise.resolve("ok"));
    operation
      .mockImplementationOnce(() =>
        Promise.reject(
          namedError("MongoNetworkError", "getaddrinfo ESERVFAIL"),
        ),
      )
      .mockImplementationOnce(() => Promise.resolve("ok"));

    await expect(
      withTransientMongoRetry(operation, { attempts: 3, delayMs: 10, sleep }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("does not retry non-transient failures", async () => {
    const sleep = mock((_ms: number) => Promise.resolve());
    const failure = new Error("database unavailable");
    const operation = mock(() => Promise.reject(failure));

    await expect(
      withTransientMongoRetry(operation, { attempts: 3, delayMs: 10, sleep }),
    ).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rethrows the last transient failure after exhausting attempts", async () => {
    const sleep = mock((_ms: number) => Promise.resolve());
    const failure = namedError(
      "PoolClearedOnNetworkError",
      "Connection interrupted due to server monitor timeout",
    );
    const operation = mock(() => Promise.reject(failure));

    await expect(
      withTransientMongoRetry(operation, { attempts: 3, delayMs: 5, sleep }),
    ).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
