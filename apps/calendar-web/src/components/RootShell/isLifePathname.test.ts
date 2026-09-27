import { ROOT_ROUTES } from "@web/common/constants/routes";
import { isLifePathname } from "./isLifePathname";
import { describe, expect, it } from "bun:test";

describe("isLifePathname", () => {
  it("matches /life and nested life paths", () => {
    expect(isLifePathname(ROOT_ROUTES.LIFE)).toBe(true);
    expect(isLifePathname(`${ROOT_ROUTES.LIFE}/`)).toBe(true);
    expect(isLifePathname(`${ROOT_ROUTES.LIFE}/share`)).toBe(true);
  });

  it("does not match calendar routes", () => {
    expect(isLifePathname(ROOT_ROUTES.ROOT)).toBe(false);
    expect(isLifePathname(ROOT_ROUTES.WEEK)).toBe(false);
    expect(isLifePathname(ROOT_ROUTES.DAY)).toBe(false);
    expect(isLifePathname("/lifetime")).toBe(false);
  });
});
