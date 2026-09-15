import { ObjectId } from "bson";
import {
  createdAtFromObjectIdHex,
  createObjectIdString,
} from "./object-id.util";

describe("createObjectIdString", () => {
  it("returns a valid MongoDB ObjectId string", () => {
    const id = createObjectIdString();

    expect(ObjectId.isValid(id)).toBe(true);
    expect(id).toMatch(/^[a-f0-9]{24}$/);
  });

  it("returns a distinct id on each call", () => {
    expect(createObjectIdString()).not.toBe(createObjectIdString());
  });
});

describe("createdAtFromObjectIdHex", () => {
  it("matches bson ObjectId.getTimestamp for a 24-hex id", () => {
    const id = createObjectIdString();
    expect(createdAtFromObjectIdHex(id)).toBe(
      new ObjectId(id).getTimestamp().toISOString(),
    );
  });

  it("returns now for a non-ObjectId string", () => {
    const before = Date.now();
    const iso = createdAtFromObjectIdHex("not-an-object-id");
    const parsed = Date.parse(iso);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(Date.now());
  });
});
