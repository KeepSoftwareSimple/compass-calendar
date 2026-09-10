import { Status } from "@core/errors/status.codes";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { UtilDriver } from "@backend/__tests__/drivers/util.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import mongoService from "@backend/common/services/mongo.service";
import { ensureUserIndexes } from "@backend/user/user-indexes";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("HiddenEventsController", () => {
  const baseDriver = new BaseDriver();

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureUserIndexes();
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  const sessionCookie = (userId: string) =>
    `session=${JSON.stringify({ userId })}`;

  it("GET returns an empty list", async () => {
    const { user } = await UtilDriver.setupTestUser();

    const response = await baseDriver
      .getServer()
      .get("/api/user/hidden-events")
      .set("Cookie", sessionCookie(user._id.toString()))
      .expect(Status.OK);

    expect(response.body).toEqual({ hiddenEventIds: [] });
  });

  it("PUT hidden true twice leaves one row and returns that id", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const cookie = sessionCookie(user._id.toString());

    const first = await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .set("Cookie", cookie)
      .send({ eventId: "evt-1", hidden: true })
      .expect(Status.OK);
    const second = await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .set("Cookie", cookie)
      .send({ eventId: "evt-1", hidden: true })
      .expect(Status.OK);

    expect(first.body).toEqual({ hiddenEventIds: ["evt-1"] });
    expect(second.body).toEqual({ hiddenEventIds: ["evt-1"] });
    expect(
      await mongoService.hiddenEvent.countDocuments({ userId: user._id }),
    ).toBe(1);
  });

  it("PUT hidden false removes the id", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const cookie = sessionCookie(user._id.toString());

    await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .set("Cookie", cookie)
      .send({ eventId: "evt-1", hidden: true })
      .expect(Status.OK);

    const response = await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .set("Cookie", cookie)
      .send({ eventId: "evt-1", hidden: false })
      .expect(Status.OK);

    expect(response.body).toEqual({ hiddenEventIds: [] });
    expect(
      await mongoService.hiddenEvent.countDocuments({ userId: user._id }),
    ).toBe(0);
  });

  it("round-trips an occurrence id containing ::", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const occurrenceId = "evt-1::2026-07-14T15:00:00.000Z";

    const response = await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .set("Cookie", sessionCookie(user._id.toString()))
      .send({ eventId: occurrenceId, hidden: true })
      .expect(Status.OK);

    expect(response.body).toEqual({ hiddenEventIds: [occurrenceId] });
  });

  it("does not return another user's hidden ids", async () => {
    const { user: userA } = await UtilDriver.setupTestUser();
    const { user: userB } = await UtilDriver.setupTestUser();

    await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .set("Cookie", sessionCookie(userA._id.toString()))
      .send({ eventId: "evt-a", hidden: true })
      .expect(Status.OK);

    const response = await baseDriver
      .getServer()
      .get("/api/user/hidden-events")
      .set("Cookie", sessionCookie(userB._id.toString()))
      .expect(Status.OK);

    expect(response.body).toEqual({ hiddenEventIds: [] });
  });

  it("PUT with an extra key is 400 INVALID_INPUT", async () => {
    const { user } = await UtilDriver.setupTestUser();

    const response = await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .set("Cookie", sessionCookie(user._id.toString()))
      .send({ eventId: "evt-1", hidden: true, extra: true })
      .expect(Status.BAD_REQUEST);

    expect(response.body).toEqual({
      code: "INVALID_INPUT",
      message: "Invalid input",
    });
  });

  it("PUT with an empty eventId is 400 INVALID_INPUT", async () => {
    const { user } = await UtilDriver.setupTestUser();

    const response = await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .set("Cookie", sessionCookie(user._id.toString()))
      .send({ eventId: "", hidden: true })
      .expect(Status.BAD_REQUEST);

    expect(response.body).toEqual({
      code: "INVALID_INPUT",
      message: "Invalid input",
    });
  });

  it("returns 401 when there is no session", async () => {
    await baseDriver
      .getServer()
      .get("/api/user/hidden-events")
      .expect(Status.UNAUTHORIZED);

    await baseDriver
      .getServer()
      .put("/api/user/hidden-events")
      .send({ eventId: "evt-1", hidden: true })
      .expect(Status.UNAUTHORIZED);
  });
});
