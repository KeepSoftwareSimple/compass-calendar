import { Status } from "@core/errors/status.codes";
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

// The public booking API must be rate-limited per (ip, key): these routes are
// reachable without a session. Each test uses its own slug/id so the shared
// in-memory buckets cannot bleed between tests.
describe("Public booking rate limits", () => {
  const baseDriver = new BaseDriver();

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await baseDriver.listen();
  });

  beforeEach(cleanupCollections);

  afterAll(async () => {
    await baseDriver.teardown();
    await cleanupTestDb();
  });

  it("throttles GET page-by-slug after 60 requests in a minute", async () => {
    const server = baseDriver.getServer();
    for (let i = 0; i < 60; i += 1) {
      await server
        .get("/api/booking/pages/limit-page-slug")
        .expect(Status.NOT_FOUND);
    }
    const throttled = await server.get("/api/booking/pages/limit-page-slug");
    expect(throttled.status).toBe(429);
  });

  it("throttles POST cancel after 10 requests in a minute", async () => {
    const server = baseDriver.getServer();
    const id = "0000000000000000000000aa";
    for (let i = 0; i < 10; i += 1) {
      await server
        .post(`/api/booking/reservations/${id}/cancel`)
        .send({ token: "a".repeat(64) })
        .expect(Status.NOT_FOUND);
    }
    const throttled = await server
      .post(`/api/booking/reservations/${id}/cancel`)
      .send({ token: "a".repeat(64) });
    expect(throttled.status).toBe(429);
  });

  it("throttles POST reschedule after 10 requests in a minute", async () => {
    const server = baseDriver.getServer();
    const id = "0000000000000000000000ee";
    for (let i = 0; i < 10; i += 1) {
      await server
        .post(`/api/booking/reservations/${id}/reschedule`)
        .send({
          token: "a".repeat(64),
          slotStart: "2026-09-07T11:00:00.000Z",
          guestTimeZone: "UTC",
          durationMinutes: 30,
        })
        .expect(Status.NOT_FOUND);
    }
    const throttled = await server
      .post(`/api/booking/reservations/${id}/reschedule`)
      .send({
        token: "a".repeat(64),
        slotStart: "2026-09-07T11:00:00.000Z",
        guestTimeZone: "UTC",
        durationMinutes: 30,
      });
    expect(throttled.status).toBe(429);
  });

  it("throttles PATCH reservation after 10 requests in a minute", async () => {
    const server = baseDriver.getServer();
    const id = "0000000000000000000000bb";
    for (let i = 0; i < 10; i += 1) {
      await server
        .patch(`/api/booking/reservations/${id}`)
        .send({ token: "a".repeat(64), name: "Ada" })
        .expect(Status.NOT_FOUND);
    }
    const throttled = await server
      .patch(`/api/booking/reservations/${id}`)
      .send({ token: "a".repeat(64), name: "Ada" });
    expect(throttled.status).toBe(429);
  });

  it("does not throttle a different reservation id PATCH bucket", async () => {
    const server = baseDriver.getServer();
    const busyId = "0000000000000000000000cc";
    const quietId = "0000000000000000000000dd";
    for (let i = 0; i < 11; i += 1) {
      await server
        .patch(`/api/booking/reservations/${busyId}`)
        .send({ token: "a".repeat(64), name: "Ada" });
    }
    await server
      .patch(`/api/booking/reservations/${quietId}`)
      .send({ token: "a".repeat(64), name: "Ada" })
      .expect(Status.NOT_FOUND);
  });

  it("does not throttle a different slug's bucket", async () => {
    const server = baseDriver.getServer();
    for (let i = 0; i < 61; i += 1) {
      await server.get("/api/booking/pages/busy-neighbor-slug");
    }
    await server
      .get("/api/booking/pages/quiet-neighbor-slug")
      .expect(Status.NOT_FOUND);
  });
});

describe("Host admin booking rate limits", () => {
  const baseDriver = new BaseDriver();

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await baseDriver.listen();
  });

  beforeEach(cleanupCollections);

  afterAll(async () => {
    await baseDriver.teardown();
    await cleanupTestDb();
  });

  const sessionCookie = (userId: string) =>
    `session=${JSON.stringify({ userId })}`;

  const getAdminPage = (userId: string) =>
    baseDriver
      .getServer()
      .get("/api/booking/page")
      .set("Cookie", sessionCookie(userId));

  const getAdminPageStatus = (userId: string) =>
    baseDriver
      .getServer()
      .get("/api/booking/page/status")
      .set("Cookie", sessionCookie(userId));

  const putAdminPage = (userId: string) =>
    baseDriver
      .getServer()
      .put("/api/booking/page")
      .set("Cookie", sessionCookie(userId))
      .send({});

  it("throttles GET /api/booking/page after 60 requests in a minute", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const userId = user._id.toString();
    for (let i = 0; i < 60; i += 1) {
      await getAdminPage(userId);
    }
    const throttled = await getAdminPage(userId);
    expect(throttled.status).toBe(429);
  });

  it("throttles GET /api/booking/page/status after 60 requests in a minute", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const userId = user._id.toString();
    for (let i = 0; i < 60; i += 1) {
      await getAdminPageStatus(userId);
    }
    const throttled = await getAdminPageStatus(userId);
    expect(throttled.status).toBe(429);
  });

  it("throttles PUT /api/booking/page after 20 requests in a minute", async () => {
    const { user } = await UtilDriver.setupTestUser();
    const userId = user._id.toString();
    for (let i = 0; i < 20; i += 1) {
      await putAdminPage(userId);
    }
    const throttled = await putAdminPage(userId);
    expect(throttled.status).toBe(429);
  });

  it("does not throttle a different host's GET bucket", async () => {
    const { user: busy } = await UtilDriver.setupTestUser();
    const { user: quiet } = await UtilDriver.setupTestUser();
    for (let i = 0; i < 61; i += 1) {
      await getAdminPage(busy._id.toString());
    }
    const response = await getAdminPage(quiet._id.toString());
    expect(response.status).not.toBe(429);
  });

  it("does not throttle a different host's PUT bucket", async () => {
    const { user: busy } = await UtilDriver.setupTestUser();
    const { user: quiet } = await UtilDriver.setupTestUser();
    for (let i = 0; i < 21; i += 1) {
      await putAdminPage(busy._id.toString());
    }
    const response = await putAdminPage(quiet._id.toString());
    expect(response.status).not.toBe(429);
  });
});
