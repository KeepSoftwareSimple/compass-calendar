import { Status } from "@core/errors/status.codes";
import { AppConfigSchema } from "@core/types/config.types";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { describe, expect, it } from "bun:test";

describe("GET /api/config", () => {
  const baseDriver = new BaseDriver();

  it("returns 200 with a schema-valid hoisted payload", async () => {
    const response = await baseDriver
      .getServer()
      .get("/api/config")
      .expect(Status.OK);

    expect(AppConfigSchema.parse(response.body)).toEqual(response.body);
  });

  it("returns the same payload across two requests", async () => {
    const first = await baseDriver
      .getServer()
      .get("/api/config")
      .expect(Status.OK);
    const second = await baseDriver
      .getServer()
      .get("/api/config")
      .expect(Status.OK);

    expect(second.body).toEqual(first.body);
  });

  it("exposes Sync cutover posture", async () => {
    const response = await baseDriver
      .getServer()
      .get("/api/config")
      .expect(Status.OK);

    expect(response.body.sync).toEqual({
      cloudMutationMode: "enabled",
      execution: "passive",
    });
  });
});
