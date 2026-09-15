import { faker } from "@faker-js/faker";
import { ObjectId } from "bson";
import { zObjectId } from "@core/types/object-id.schema";

describe("zObjectId", () => {
  it("parses a 24-hex string into an ObjectId", () => {
    const value = faker.database.mongodbObjectId();
    const parsed = zObjectId.parse(value);

    expect(parsed).toBeInstanceOf(ObjectId);
    expect(parsed.toString()).toBe(value);
  });

  it("parses an ObjectId instance", () => {
    const value = new ObjectId();

    expect(zObjectId.parse(value).equals(value)).toBe(true);
  });

  it("rejects a non-ObjectId string", () => {
    expect(zObjectId.safeParse(faker.string.ulid()).success).toBe(false);
  });
});
