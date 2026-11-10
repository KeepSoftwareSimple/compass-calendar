import {
  ensurePlaceTimeZoneSearchForTests,
  searchPlaceTimeZonesLazy,
} from "@web/timezone/place-timezone-search.lazy";
import { describe, expect, it } from "bun:test";

describe("place-timezone-search.lazy", () => {
  it("searches Tampa after preload", async () => {
    await ensurePlaceTimeZoneSearchForTests();
    const hits = searchPlaceTimeZonesLazy("tampa");
    expect(hits.some((hit) => hit.iana.includes("New_York"))).toBe(true);
  });
});
