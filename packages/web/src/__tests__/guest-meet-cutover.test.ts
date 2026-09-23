import { isGuestMeetStaticPath } from "../../guest-meet-static-path";
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const WEB_SRC = path.resolve(import.meta.dir, "..");
const BUILD_OUTDIR = path.resolve(import.meta.dir, "../../../../build/web");

/**
 * Guest UI identifiers that must not survive the cutover in calendar-web.
 * Matched on identifier boundaries: `@compass/core` exports contract names
 * that start with the same prefix (`PublicBookingPageSchema`), and
 * calendar-web imports those legitimately.
 */
const GUEST_UI_NEEDLES = [
  "PublicBookingPage",
  "PublicBookingPicker",
  "usePublicBookingFlow",
  "Meet with Tyler Dane",
];

function boundedNeedle(needle: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_$])${needle}(?![A-Za-z0-9_$])`);
}

function listModulesRecursively(dir: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      names.push(...listModulesRecursively(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      names.push(full);
    }
  }
  return names;
}

describe("guest /meet static path guard", () => {
  it("matches public guest paths and legacy /book", () => {
    expect(isGuestMeetStaticPath("/meet/tyler")).toBe(true);
    expect(isGuestMeetStaticPath("/book/tyler")).toBe(true);
    expect(isGuestMeetStaticPath("/meet/cancel/abc")).toBe(true);
    expect(isGuestMeetStaticPath("/week")).toBe(false);
  });
});

describe("calendar-web source", () => {
  // The bundle assertion below needs a build, which unit CI never produces, so
  // this is the arm of the cutover guard that actually runs on every push.
  it("keeps no guest PublicBooking UI modules", () => {
    const guestModules = listModulesRecursively(WEB_SRC)
      .map((file) => path.relative(WEB_SRC, file))
      .filter((file) => path.basename(file).startsWith("PublicBooking"));

    expect(guestModules).toEqual([]);
  });
});

describe("calendar-web production bundle", () => {
  it("does not ship guest PublicBooking UI modules", () => {
    // Only meaningful where a build exists (a dev who ran `bun run build:web`,
    // or a job that builds before testing). Skipped, not failed, otherwise.
    let files: string[];
    try {
      files = readdirSync(BUILD_OUTDIR).filter((name) => name.endsWith(".js"));
    } catch {
      return;
    }
    if (files.length === 0) {
      return;
    }

    const combined = files
      .map((name) => readFileSync(path.join(BUILD_OUTDIR, name), "utf8"))
      .join("\n");

    for (const needle of GUEST_UI_NEEDLES) {
      expect(boundedNeedle(needle).test(combined)).toBe(false);
    }
  });
});
