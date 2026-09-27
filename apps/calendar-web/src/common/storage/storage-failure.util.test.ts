import {
  classifyStorageFailure,
  isStorageWriteFailure,
  storageInitUserMessage,
  storageWriteUserMessage,
} from "./storage-failure.util";
import { describe, expect, it } from "bun:test";

describe("classifyStorageFailure", () => {
  it("classifies quota errors, including Dexie-wrapped inners", () => {
    expect(
      classifyStorageFailure(
        new DOMException("Quota exceeded", "QuotaExceededError"),
      ),
    ).toBe("quota");

    expect(
      classifyStorageFailure({
        name: "DexieError",
        inner: new DOMException("Quota exceeded", "QuotaExceededError"),
      }),
    ).toBe("quota");
  });

  it("classifies blocked storage as blocked", () => {
    expect(
      classifyStorageFailure(new DOMException("Blocked", "SecurityError")),
    ).toBe("blocked");
  });

  it("treats generic and non-Error rejections as unavailable", () => {
    expect(classifyStorageFailure(new Error("Dexie open failed"))).toBe(
      "unavailable",
    );
    expect(classifyStorageFailure("indexeddb exploded")).toBe("unavailable");
    expect(classifyStorageFailure(null)).toBe("unavailable");
  });
});

describe("storage copy", () => {
  it("keeps user-facing init and write copy free of exception text", () => {
    expect(storageInitUserMessage("quota")).toBe(
      "this device is out of storage",
    );
    expect(storageInitUserMessage("blocked")).toBe(
      "the browser blocked local storage",
    );
    expect(storageInitUserMessage("unavailable")).toBe(
      "local storage could not be opened",
    );
    expect(storageWriteUserMessage("quota")).toContain("out of storage");
    expect(storageWriteUserMessage("blocked")).toContain(
      "blocked local storage",
    );
  });

  it("treats quota, blocked, and named storage errors as write failures", () => {
    expect(
      isStorageWriteFailure(
        new DOMException("Quota exceeded", "QuotaExceededError"),
      ),
    ).toBe(true);
    expect(
      isStorageWriteFailure(new DOMException("Blocked", "SecurityError")),
    ).toBe(true);
    expect(isStorageWriteFailure(new Error("write failed"))).toBe(false);
    const closed = new Error("closed");
    closed.name = "DatabaseClosedError";
    expect(isStorageWriteFailure(closed)).toBe(true);
  });
});
