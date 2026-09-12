import {
  isMissingChunkError,
  reloadOnceForMissingChunk,
} from "./missing-chunk-reload.util";

const missingChunk = () =>
  new TypeError(
    "Failed to fetch dynamically imported module: https://compasscalendar.com/chunk-5380z7k8.js",
  );

const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
};

describe("isMissingChunkError", () => {
  it("recognizes each browser's wording for a chunk that no longer exists", () => {
    expect(isMissingChunkError(missingChunk())).toBe(true);
    expect(
      isMissingChunkError(
        new TypeError("error loading dynamically imported module: x"),
      ),
    ).toBe(true);
    expect(
      isMissingChunkError(new TypeError("Importing a module script failed.")),
    ).toBe(true);
  });

  it("leaves other boot failures alone", () => {
    expect(isMissingChunkError(new Error("boom"))).toBe(false);
    expect(isMissingChunkError("Failed to fetch")).toBe(false);
  });
});

describe("reloadOnceForMissingChunk", () => {
  it("reloads the first time a chunk is missing and reports it", () => {
    const storage = memoryStorage();
    let reloads = 0;

    const reloaded = reloadOnceForMissingChunk(missingChunk(), storage, () => {
      reloads += 1;
    });

    expect(reloaded).toBe(true);
    expect(reloads).toBe(1);
  });

  it("does not reload a second time for the same chunk", () => {
    const storage = memoryStorage();
    let reloads = 0;
    const reload = () => {
      reloads += 1;
    };

    reloadOnceForMissingChunk(missingChunk(), storage, reload);
    const reloaded = reloadOnceForMissingChunk(missingChunk(), storage, reload);

    expect(reloaded).toBe(false);
    expect(reloads).toBe(1);
  });

  it("does not reload for an unrelated error", () => {
    let reloads = 0;

    const reloaded = reloadOnceForMissingChunk(
      new Error("boom"),
      memoryStorage(),
      () => {
        reloads += 1;
      },
    );

    expect(reloaded).toBe(false);
    expect(reloads).toBe(0);
  });

  it("does not reload when storage is unavailable, so a failure cannot loop", () => {
    let reloads = 0;
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };

    const reloaded = reloadOnceForMissingChunk(missingChunk(), throwing, () => {
      reloads += 1;
    });

    expect(reloaded).toBe(false);
    expect(reloads).toBe(0);
  });
});
