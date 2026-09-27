import { ObjectId } from "bson";
import { createObjectIdString } from "./object-id.util";

describe("createObjectIdString", () => {
  it("returns a valid MongoDB ObjectId string", () => {
    const id = createObjectIdString();

    expect(ObjectId.isValid(id)).toBe(true);
    expect(id).toMatch(/^[a-f0-9]{24}$/);
  });
});
