import { type NextFunction, type Request } from "express";
import { Status } from "@core/errors/status.codes";
import { requestMiddleware } from "@backend/common/middleware/promise.middleware";
import { type Res_Promise } from "@backend/common/types/express.types";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const flushPromises = async () => {
  await new Promise(setImmediate);
};

describe("promise.middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Res_Promise;
  let mockNext: Mock<NextFunction>;

  beforeEach(() => {
    mockReq = {};
    mockNext = mock();
    mockRes = {
      status: mock().mockReturnThis(),
      send: mock().mockReturnThis(),
      // The middleware overwrites this in `requestMiddleware()`, but we define
      // it so TypeScript knows it's callable.
      promise: mock() as Res_Promise["promise"],
    } as unknown as Res_Promise;

    requestMiddleware()(
      mockReq as Request,
      mockRes,
      mockNext as unknown as NextFunction,
    );
  });

  it("sends an empty body for NO_CONTENT status-only payloads", async () => {
    mockRes.promise(Promise.resolve({ statusCode: Status.NO_CONTENT }));

    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(Status.NO_CONTENT);
    expect(mockRes.send).toHaveBeenCalledWith();
  });

  it("preserves response bodies when statusCode is part of a larger payload", async () => {
    const payload = {
      statusCode: Status.OK,
      events: [],
    };

    mockRes.promise(Promise.resolve(payload));

    await flushPromises();

    expect(mockRes.status).toHaveBeenCalledWith(Status.OK);
    expect(mockRes.send).toHaveBeenCalledWith(payload);
  });
});
