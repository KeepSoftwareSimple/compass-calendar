import {
  dayCalendarColumnDisplayNames,
  defaultDayCalendarColumnDisplayName,
  emailDomainStem,
  formatDayCalendarColumnDisplayName,
} from "./dayCalendarColumnDisplayName.util";
import { describe, expect, it } from "bun:test";

describe("defaultDayCalendarColumnDisplayName", () => {
  it("uses the local part for email calendar names", () => {
    expect(defaultDayCalendarColumnDisplayName("tyler@tylerdane.com")).toBe(
      "tyler",
    );
  });
});

describe("emailDomainStem", () => {
  it("drops a short TLD segment", () => {
    expect(emailDomainStem("keepsoftwaresimple.com")).toBe(
      "keepsoftwaresimple",
    );
  });
});

describe("dayCalendarColumnDisplayNames", () => {
  it("disambiguates duplicate email local parts with domain stems", () => {
    expect(
      dayCalendarColumnDisplayNames([
        "tyler@tylerdane.com",
        "tyler@keepsoftwaresimple.com",
      ]),
    ).toEqual(["tylerdane", "keepsoftwaresimple"]);
  });

  it("keeps a lone email on the local part", () => {
    expect(dayCalendarColumnDisplayNames(["tyler@tylerdane.com"])).toEqual([
      "tyler",
    ]);
  });

  it("keeps spaced and ordinary names unchanged", () => {
    expect(
      dayCalendarColumnDisplayNames([
        "Holidays in United States",
        "journey-mens-group",
      ]),
    ).toEqual(["Holidays in United States", "journey-mens-group"]);
  });

  it("falls back to local@domain-stem when domain stems still collide", () => {
    expect(
      dayCalendarColumnDisplayNames([
        "tyler@mail.example.com",
        "tyler@team.example.com",
      ]),
    ).toEqual(["tyler@mail", "tyler@team"]);
  });
});

describe("formatDayCalendarColumnDisplayName", () => {
  it("delegates to the batch helper for a single name", () => {
    expect(formatDayCalendarColumnDisplayName("tyler@tylerdane.com")).toBe(
      "tyler",
    );
  });
});
