import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { UtilDriver } from "@backend/__tests__/drivers/util.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("life preferences", () => {
  const driver = new BaseDriver();
  const path = "/api/user/life-preferences";
  const preferences = {
    birthDate: "1990-02-03",
    lifespan: 79,
    variation: "average",
  };
  beforeAll(() => setupTestDb(import.meta.url));
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);
  const cookie = (id: string) => `session=${JSON.stringify({ userId: id })}`;

  it("initializes once and rejects stale device writes", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const auth = cookie(user._id.toString());
    const get = () => driver.getServer().get(path).set("Cookie", auth);
    const put = (expectedRevision: number | null, lifespan = 79) =>
      driver
        .getServer()
        .put(path)
        .set("Cookie", auth)
        .send({ preferences: { ...preferences, lifespan }, expectedRevision });
    expect((await get().expect(200)).body).toEqual({
      preferences: null,
      revision: 0,
    });
    expect((await put(null).expect(200)).body.revision).toBe(1);
    expect((await put(null, 100).expect(200)).body.preferences.lifespan).toBe(
      79,
    );
    expect((await put(1, 85).expect(200)).body.revision).toBe(2);
    expect((await put(1, 90).expect(409)).body.preferences.lifespan).toBe(85);
    expect((await get().expect(200)).body.preferences.lifespan).toBe(85);
  });

  it("scopes settings to the session and validates real, past birthdays", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const { user: other } = await UtilDriver.setupTestUser();
    for (const birthDate of ["2025-02-29", "2099-01-01", "not-a-date"]) {
      await driver
        .getServer()
        .put(path)
        .set("Cookie", cookie(user._id.toString()))
        .send({
          preferences: { ...preferences, birthDate },
          expectedRevision: null,
        })
        .expect(400);
    }
    await driver
      .getServer()
      .put(path)
      .set("Cookie", cookie(user._id.toString()))
      .send({
        preferences,
        expectedRevision: null,
        userId: other._id.toString(),
      })
      .expect(400);
    expect(
      (
        await driver
          .getServer()
          .get(path)
          .set("Cookie", cookie(other._id.toString()))
          .expect(200)
      ).body.preferences,
    ).toBeNull();
  });
});
