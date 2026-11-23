import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import emailReflectionController from "@backend/email/controllers/email.reflection.controller";
import { createUnsubscribeToken } from "@backend/email/unsubscribe-token";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

describe("EmailReflectionController db", () => {
  const original = { ...CONFIG };
  beforeAll(() => setupTestDb(import.meta.url));
  beforeEach(async () => {
    await cleanupCollections();
    Object.assign(CONFIG, {
      EMAIL_PROVIDER: "log",
      REFLECTION_ENABLED: true,
      EMAIL_UNSUBSCRIBE_SECRET: "test-secret",
    });
  });
  afterEach(() => Object.assign(CONFIG, original));
  afterAll(cleanupTestDb);

  const insertUser = async (extra: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    await mongoService.user.insertOne({
      _id,
      email: "reader@example.com",
      firstName: "Reader",
      lastName: "User",
      name: "Reader User",
      locale: "en",
      ...extra,
    });
    return {
      _id,
      token: createUnsubscribeToken(_id.toHexString(), "test-secret"),
    };
  };
  const respond = () => {
    let body = "";
    const res = {
      status: mock(() => res),
      type: mock(() => res),
      send: mock((value: string) => {
        body = value;
      }),
    };
    return { res, body: () => body };
  };

  it("GET shows the opt-in page for a valid token and a friendly page otherwise", async () => {
    const { token } = await insertUser();
    const ok = respond();
    await emailReflectionController.showConfirmation(
      { query: { token } } as never,
      ok.res as never,
    );
    expect(ok.body()).toContain("Turn on weekly reflections");
    const bad = respond();
    await emailReflectionController.showConfirmation(
      { query: { token: "nope" } } as never,
      bad.res as never,
    );
    expect(bad.body()).toContain("no longer valid");
  });

  it("POST enrolls the account with the browser timezone and queues one confirmation", async () => {
    const { _id, token } = await insertUser();
    const out = respond();
    await emailReflectionController.confirmEnable(
      { body: { token, timeZone: "America/Denver" } } as never,
      out.res as never,
    );
    expect(out.body()).toContain("Weekly reflections are on");
    const user = await mongoService.user.findOne({ _id });
    expect(user?.reflectionPreferences).toMatchObject({
      enabled: true,
      timeZone: "America/Denver",
    });
    expect(
      await mongoService.emailSend.countDocuments({
        userId: _id,
        stepKey: "confirmation",
      }),
    ).toBe(1);
  });

  it("POST refuses accounts that unsubscribed from all email", async () => {
    const { _id, token } = await insertUser({
      emailPreferences: { unsubscribedAt: new Date() },
    });
    const out = respond();
    await emailReflectionController.confirmEnable(
      { body: { token, timeZone: "UTC" } } as never,
      out.res as never,
    );
    expect(out.body()).toContain("unsubscribed from all Compass emails");
    expect(
      (await mongoService.user.findOne({ _id }))?.reflectionPreferences,
    ).toBeUndefined();
  });
});
