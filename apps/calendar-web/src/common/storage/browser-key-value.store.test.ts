import { z } from "zod/v4";
import {
  createBrowserKeyValueStore,
  persistentBrowserStore,
  sessionBrowserStore,
} from "./browser-key-value.store";
import {
  readIdList,
  readIdSet,
  readJsonValue,
  writeIdList,
  writeIdSet,
  writeJsonValue,
} from "./json-value.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("BrowserKeyValueStore", () => {
  it("reads, writes, removes, and enumerates values", () => {
    const storage = createStorage();
    const store = createBrowserKeyValueStore(() => storage);

    expect(store.isAvailable()).toBe(true);
    expect(store.set("one", "1")).toBe(true);
    expect(store.set("two", "2")).toBe(true);
    expect(store.get("one")).toBe("1");
    expect(store.keys()).toEqual(["one", "two"]);
    expect(store.remove("one")).toBe(true);
    expect(store.get("one")).toBeNull();
  });

  it("handles unavailable storage without throwing", () => {
    const store = createBrowserKeyValueStore(() => {
      throw new Error("Storage unavailable");
    });

    expect(store.isAvailable()).toBe(false);
    expect(store.get("key")).toBeNull();
    expect(store.set("key", "value")).toBe(false);
    expect(store.remove("key")).toBe(false);
    expect(store.keys()).toEqual([]);
  });

  it("reports quota and security failures", () => {
    const storage = createStorage();
    storage.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
    storage.removeItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };

    const store = createBrowserKeyValueStore(() => storage);

    expect(store.set("key", "value")).toBe(false);
    expect(store.remove("key")).toBe(false);
  });
});

describe("configured browser stores", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps persistent and session values separate", () => {
    expect(persistentBrowserStore.set("key", "persistent")).toBe(true);
    expect(sessionBrowserStore.set("key", "session")).toBe(true);

    expect(persistentBrowserStore.get("key")).toBe("persistent");
    expect(sessionBrowserStore.get("key")).toBe("session");
  });
});

// json-value.store is a thin layer over the persistent store above, so its
// cases live here rather than in a file of their own: the web suite's shards
// are packed by file count against an RSS guard, and one extra file reshuffles
// every shard boundary (see packages/scripts/src/testing/test-parallel.ts).
const JSON_KEY = "compass.test.json-value";
const CountSchema = z.object({ count: z.number().int() });
const COUNT_FALLBACK = { count: 0 };

afterEach(() => {
  persistentBrowserStore.remove(JSON_KEY);
});

describe("readJsonValue", () => {
  it("returns the fallback when the key is absent", () => {
    expect(readJsonValue(JSON_KEY, CountSchema, COUNT_FALLBACK)).toBe(
      COUNT_FALLBACK,
    );
  });

  it("returns the fallback for malformed JSON", () => {
    persistentBrowserStore.set(JSON_KEY, "{not-json");
    expect(readJsonValue(JSON_KEY, CountSchema, COUNT_FALLBACK)).toBe(
      COUNT_FALLBACK,
    );
  });

  it("returns the fallback when the schema rejects the stored value", () => {
    persistentBrowserStore.set(JSON_KEY, JSON.stringify({ count: "seven" }));
    expect(readJsonValue(JSON_KEY, CountSchema, COUNT_FALLBACK)).toBe(
      COUNT_FALLBACK,
    );
  });

  it("round-trips a value the schema accepts", () => {
    writeJsonValue(JSON_KEY, { count: 7 });
    expect(readJsonValue(JSON_KEY, CountSchema, COUNT_FALLBACK)).toEqual({
      count: 7,
    });
  });

  it("applies a schema transform on read", () => {
    writeJsonValue(JSON_KEY, { count: 2 });
    const doubled = CountSchema.transform(({ count }) => count * 2);
    expect(readJsonValue(JSON_KEY, doubled, 0)).toBe(4);
  });
});

describe("readIdList", () => {
  it("reads an absent key as an empty list", () => {
    expect(readIdList(JSON_KEY)).toEqual([]);
  });

  it("round-trips ids in order", () => {
    writeIdList(JSON_KEY, ["b", "a", "c"]);
    expect(readIdList(JSON_KEY)).toEqual(["b", "a", "c"]);
  });

  it("removes the key rather than storing an empty list", () => {
    writeIdList(JSON_KEY, ["a"]);
    expect(writeIdList(JSON_KEY, [])).toBe(true);
    expect(persistentBrowserStore.get(JSON_KEY)).toBeNull();
  });

  it("falls back to empty when an entry is not a usable id", () => {
    persistentBrowserStore.set(JSON_KEY, JSON.stringify(["a", ""]));
    expect(readIdList(JSON_KEY)).toEqual([]);
  });

  it("falls back to empty when the stored value is not a list", () => {
    persistentBrowserStore.set(JSON_KEY, JSON.stringify({ a: 1 }));
    expect(readIdList(JSON_KEY)).toEqual([]);
  });
});

describe("readIdSet", () => {
  it("round-trips a set", () => {
    writeIdSet(JSON_KEY, new Set(["a", "b"]));
    expect([...readIdSet(JSON_KEY)].sort()).toEqual(["a", "b"]);
  });

  it("removes the key for an empty set", () => {
    writeIdSet(JSON_KEY, new Set(["a"]));
    writeIdSet(JSON_KEY, new Set());
    expect(persistentBrowserStore.get(JSON_KEY)).toBeNull();
    expect(readIdSet(JSON_KEY).size).toBe(0);
  });
});

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
