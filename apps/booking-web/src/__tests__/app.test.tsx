import { publicBookRoute, routeTree } from "@booking-web/routers/router.routes";
import { describe, expect, it } from "bun:test";

describe("App", () => {
  it("registers the public meet route on the booking-web tree", () => {
    expect(routeTree.children?.length).toBeGreaterThan(0);
    expect(publicBookRoute.fullPath).toBe("/meet/$username");
  });
});
