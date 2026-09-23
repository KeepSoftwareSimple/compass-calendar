import { isGuestMeetStaticPath } from "../../guest-meet-static-path";
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("guest /meet static path guard", () => {
  it("matches public guest paths and legacy /book", () => {
    expect(isGuestMeetStaticPath("/meet/tyler")).toBe(true);
    expect(isGuestMeetStaticPath("/book/tyler")).toBe(true);
    expect(isGuestMeetStaticPath("/meet/cancel/abc")).toBe(true);
    expect(isGuestMeetStaticPath("/week")).toBe(false);
  });
});

describe("calendar-web production bundle", () => {
  it("does not ship guest PublicBooking UI modules", () => {
    const outdir = path.resolve(import.meta.dir, "../../../../build/web");
    let files: string[];
    try {
      files = readdirSync(outdir).filter((name) => name.endsWith(".js"));
    } catch {
      return;
    }
    if (files.length === 0) {
      return;
    }

    const guestUiNeedles = [
      "PublicBookingPage",
      "PublicBookingPicker",
      "usePublicBookingFlow",
      "Meet with Tyler Dane",
    ];
    const combined = files
      .map((name) => readFileSync(path.join(outdir, name), "utf8"))
      .join("\n");

    for (const needle of guestUiNeedles) {
      expect(combined.includes(needle)).toBe(false);
    }
  });
});
