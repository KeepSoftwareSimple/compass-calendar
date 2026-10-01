import {
  buildTimeZoneList,
  filterTimeZones,
  sortTimeZonesByOffsetDistance,
} from "@web/timezone/timezone-catalog";
import { describe, expect, it } from "bun:test";

const at = new Date("2026-07-15T18:00:00.000Z");

describe("timezone-catalog", () => {
  const zones = buildTimeZoneList(at);

  it("filters by city, abbreviation, and region", () => {
    const chicago = filterTimeZones(zones, "Chi").map((zone) => zone.id);
    expect(chicago).toContain("America/Chicago");

    const edt = filterTimeZones(zones, "EDT").map((zone) => zone.id);
    expect(edt.some((id) => id.startsWith("America/"))).toBe(true);

    const america = filterTimeZones(zones, "America");
    expect(america.length).toBeGreaterThan(10);
    expect(
      america.every(
        (zone) => zone.id.includes("America") || zone.name.includes("America"),
      ),
    ).toBe(true);
  });

  it("finds zones by generic name, best-known city first", () => {
    const sorted = sortTimeZonesByOffsetDistance(zones, "America/Denver");
    const firstMatch = (query: string) => filterTimeZones(sorted, query)[0]?.id;

    expect(firstMatch("central")).toBe("America/Chicago");
    expect(firstMatch("eastern")).toBe("America/New_York");
    expect(firstMatch("pacific")).toBe("America/Los_Angeles");
    expect(firstMatch("mountain")).toBe("America/Denver");
    expect(firstMatch("central european")).toBe("Europe/Paris");
  });

  it("labels each zone with its generic name", () => {
    const chicago = zones.find((zone) => zone.id === "America/Chicago");
    expect(chicago?.secondary).toBe("Central Time, CDT, GMT-5");

    const rioGallegos = zones.find(
      (zone) => zone.id === "America/Argentina/Rio_Gallegos",
    );
    expect(rioGallegos?.secondary).toBe("Argentina Standard Time, GMT-3");
  });

  it("formats offset labels as strings, not objects", () => {
    const chicago = zones.find((zone) => zone.id === "America/Chicago");
    expect(chicago).toBeTruthy();
    if (!chicago) return;

    expect(chicago.offset).toMatch(/GMT/);
    expect(chicago.secondary).not.toContain("[object Object]");
    expect(
      chicago.keywords.every((keyword) => typeof keyword === "string"),
    ).toBe(true);
  });

  it("sorts the current zone first, then by offset distance", () => {
    const sorted = sortTimeZonesByOffsetDistance(zones, "America/Denver");
    expect(sorted[0]?.id).toBe("America/Denver");

    const denver = zones.find((zone) => zone.id === "America/Denver");
    const chicago = zones.find((zone) => zone.id === "America/Chicago");
    const tokyo = zones.find((zone) => zone.id === "Asia/Tokyo");
    expect(denver && chicago && tokyo).toBeTruthy();
    if (!denver || !chicago || !tokyo) return;

    const chicagoIndex = sorted.findIndex(
      (zone) => zone.id === "America/Chicago",
    );
    const tokyoIndex = sorted.findIndex((zone) => zone.id === "Asia/Tokyo");
    expect(chicagoIndex).toBeGreaterThan(0);
    expect(chicagoIndex).toBeLessThan(tokyoIndex);
  });
});
