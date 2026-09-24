import {
  isDuplicateKeyError,
  isOnlyDuplicateKeyError,
} from "./mongo-duplicate-key.util";
import { describe, expect, it } from "bun:test";

const serverError = (code: number): Error & { code: number } =>
  Object.assign(new Error("E11000 duplicate key error"), { code });

const bulkError = (
  ...codes: number[]
): Error & { writeErrors: { code: number }[] } =>
  Object.assign(new Error("Bulk write error"), {
    writeErrors: codes.map((code) => ({ code })),
  });

describe("isDuplicateKeyError", () => {
  it("matches a duplicate-key error by code", () => {
    expect(isDuplicateKeyError(serverError(11000))).toBe(true);
  });

  it("matches a bulk write where any document hit a unique index", () => {
    expect(isDuplicateKeyError(bulkError(11000, 121))).toBe(true);
  });

  it("rejects other server errors, bulk or not", () => {
    expect(isDuplicateKeyError(serverError(121))).toBe(false);
    expect(isDuplicateKeyError(bulkError(121, 66))).toBe(false);
  });

  it("rejects values that carry no code at all", () => {
    expect(isDuplicateKeyError(new Error("network"))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError("E11000")).toBe(false);
  });
});

describe("isOnlyDuplicateKeyError", () => {
  it("matches a duplicate-key error by code", () => {
    expect(isOnlyDuplicateKeyError(serverError(11000))).toBe(true);
  });

  it("matches a bulk write whose every failure was a duplicate", () => {
    expect(isOnlyDuplicateKeyError(bulkError(11000, 11000))).toBe(true);
  });

  it("rejects a mixed batch so the real failure still throws", () => {
    expect(isOnlyDuplicateKeyError(bulkError(11000, 121))).toBe(false);
  });

  it("rejects an error with neither a code nor write errors", () => {
    expect(isOnlyDuplicateKeyError(new Error("network"))).toBe(false);
    expect(isOnlyDuplicateKeyError(bulkError())).toBe(false);
    expect(isOnlyDuplicateKeyError(null)).toBe(false);
  });
});
