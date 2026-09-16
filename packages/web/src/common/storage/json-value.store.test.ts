import { z } from "zod/v4";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  readIdList,
  readIdSet,
  readJsonValue,
  writeIdList,
  writeIdSet,
  writeJsonValue,
} from "./json-value.store";
import { afterEach, describe, expect, it } from "bun:test";

const KEY = "compass.test.json-value";

afterEach(() => {
  persistentBrowserStore.remove(KEY);
});

const CountSchema = z.object({ count: z.number().int() });
const FALLBACK = { count: 0 };

describe("readJsonValue", () => {
  it("returns the fallback when the key is absent", () => {
    expect(readJsonValue(KEY, CountSchema, FALLBACK)).toBe(FALLBACK);
  });

  it("returns the fallback for malformed JSON", () => {
    persistentBrowserStore.set(KEY, "{not-json");
    expect(readJsonValue(KEY, CountSchema, FALLBACK)).toBe(FALLBACK);
  });

  it("returns the fallback when the schema rejects the stored value", () => {
    persistentBrowserStore.set(KEY, JSON.stringify({ count: "seven" }));
    expect(readJsonValue(KEY, CountSchema, FALLBACK)).toBe(FALLBACK);
  });

  it("round-trips a value the schema accepts", () => {
    writeJsonValue(KEY, { count: 7 });
    expect(readJsonValue(KEY, CountSchema, FALLBACK)).toEqual({ count: 7 });
  });

  it("applies a schema transform on read", () => {
    writeJsonValue(KEY, { count: 2 });
    const doubled = CountSchema.transform(({ count }) => count * 2);
    expect(readJsonValue(KEY, doubled, 0)).toBe(4);
  });
});

describe("readIdList", () => {
  it("reads an absent key as an empty list", () => {
    expect(readIdList(KEY)).toEqual([]);
  });

  it("round-trips ids in order", () => {
    writeIdList(KEY, ["b", "a", "c"]);
    expect(readIdList(KEY)).toEqual(["b", "a", "c"]);
  });

  it("removes the key rather than storing an empty list", () => {
    writeIdList(KEY, ["a"]);
    expect(writeIdList(KEY, [])).toBe(true);
    expect(persistentBrowserStore.get(KEY)).toBeNull();
  });

  it("falls back to empty when an entry is not a usable id", () => {
    persistentBrowserStore.set(KEY, JSON.stringify(["a", ""]));
    expect(readIdList(KEY)).toEqual([]);
  });

  it("falls back to empty when the stored value is not a list", () => {
    persistentBrowserStore.set(KEY, JSON.stringify({ a: 1 }));
    expect(readIdList(KEY)).toEqual([]);
  });
});

describe("readIdSet", () => {
  it("round-trips a set", () => {
    writeIdSet(KEY, new Set(["a", "b"]));
    expect([...readIdSet(KEY)].sort()).toEqual(["a", "b"]);
  });

  it("removes the key for an empty set", () => {
    writeIdSet(KEY, new Set(["a"]));
    writeIdSet(KEY, new Set());
    expect(persistentBrowserStore.get(KEY)).toBeNull();
    expect(readIdSet(KEY).size).toBe(0);
  });
});
