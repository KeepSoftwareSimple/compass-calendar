import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realBrowserNavigationUtil from "@web/common/utils/browser/browser-navigation.util";
import {
  importOrReload,
  isMissingChunkError,
  reloadOnceForMissingChunk,
} from "@web/common/utils/browser/missing-chunk-reload.util";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockReload = mock();

mockModuleForFile(
  "@web/common/utils/browser/browser-navigation.util",
  realBrowserNavigationUtil,
  {
    reloadLocation: mockReload,
  },
);

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

    const reloaded = reloadOnceForMissingChunk(
      missingChunk(),
      "app-boot",
      storage,
      () => {
        reloads += 1;
      },
    );

    expect(reloaded).toBe(true);
    expect(reloads).toBe(1);
  });

  it("does not reload a second time for the same chunk", () => {
    const storage = memoryStorage();
    let reloads = 0;
    const reload = () => {
      reloads += 1;
    };

    reloadOnceForMissingChunk(missingChunk(), "app-boot", storage, reload);
    const reloaded = reloadOnceForMissingChunk(
      missingChunk(),
      "app-boot",
      storage,
      reload,
    );

    expect(reloaded).toBe(false);
    expect(reloads).toBe(1);
  });

  it("does not reload for an unrelated error", () => {
    let reloads = 0;

    const reloaded = reloadOnceForMissingChunk(
      new Error("boom"),
      "app-boot",
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

    const reloaded = reloadOnceForMissingChunk(
      missingChunk(),
      "app-boot",
      throwing,
      () => {
        reloads += 1;
      },
    );

    expect(reloaded).toBe(false);
    expect(reloads).toBe(0);
  });
});

describe("importOrReload", () => {
  beforeEach(() => {
    mockReload.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("resolves with the module when the chunk loads", async () => {
    const module = { value: 1 };

    await expect(importOrReload(async () => module)).resolves.toBe(module);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it("reloads once and never settles when a deploy removed the chunk", async () => {
    let settled = false;

    void importOrReload(() => Promise.reject(missingChunk())).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
  });

  it("rejects when the chunk is still missing after the reload", async () => {
    void importOrReload(() => Promise.reject(missingChunk()));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(
      importOrReload(() => Promise.reject(missingChunk())),
    ).rejects.toThrow("Failed to fetch dynamically imported module");
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("rejects an unrelated error without a reload", async () => {
    await expect(
      importOrReload(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(mockReload).not.toHaveBeenCalled();
  });
});
