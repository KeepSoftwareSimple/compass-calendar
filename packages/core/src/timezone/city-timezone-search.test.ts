import {
  normalizePlaceSearchQuery,
  searchPlaceTimeZones,
} from "@core/timezone/city-timezone-search";
import { describe, expect, it } from "bun:test";

describe("city-timezone-search", () => {
  it("finds Tampa in Eastern Time", () => {
    const hits = searchPlaceTimeZones("tampa");
    expect(hits.some((hit) => hit.iana === "America/New_York")).toBe(true);
    expect(hits[0]?.placeLabel).toMatch(/Tampa/i);
  });

  it("finds Pensacola in Central Time", () => {
    const hits = searchPlaceTimeZones("pensacola");
    expect(hits[0]?.iana).toBe("America/Chicago");
  });

  it("surfaces both US Florida zones for a state query", () => {
    const hits = searchPlaceTimeZones("florida");
    const zones = new Set(hits.map((hit) => hit.iana));
    expect(zones.has("America/New_York")).toBe(true);
    expect(zones.has("America/Chicago")).toBe(true);
    expect(hits[0]?.multiZoneRegion).toBe("florida");
    expect(hits.every((hit) => hit.placeLabel.includes("US"))).toBe(true);
  });

  it("normalizes accents and case", () => {
    expect(normalizePlaceSearchQuery("São Paulo")).toBe("sao paulo");
    const hits = searchPlaceTimeZones("sao paulo");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.iana).toMatch(/^America\//);
  });

  it("returns nothing for nonsense query", () => {
    expect(searchPlaceTimeZones("zzzznotacity")).toEqual([]);
  });
});
