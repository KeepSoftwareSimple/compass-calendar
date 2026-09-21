import {
  CONNECTION_REPORT_USAGE,
  parseConnectionReportArgs,
  resolveApiMongoUri,
} from "@scripts/commands/connection-report";
import {
  ConnectionReportSchema,
  formatConnectionReport,
} from "@scripts/commands/connection-report/report";
import { describe, expect, it } from "bun:test";

describe("connection-report CLI args", () => {
  it("parses --json and --api-mongo-uri", () => {
    expect(parseConnectionReportArgs([])).toEqual({
      json: false,
      apiMongoUri: null,
      help: false,
    });
    expect(
      parseConnectionReportArgs([
        "--json",
        "--api-mongo-uri",
        "mongodb://localhost:27017/compass",
      ]),
    ).toEqual({
      json: true,
      apiMongoUri: "mongodb://localhost:27017/compass",
      help: false,
    });
  });

  it("treats -h and --help as usage", () => {
    expect(parseConnectionReportArgs(["--help"]).help).toBe(true);
    expect(parseConnectionReportArgs(["-h"]).help).toBe(true);
    expect(CONNECTION_REPORT_USAGE).toContain("--json");
    expect(CONNECTION_REPORT_USAGE).toContain("--api-mongo-uri");
  });

  it("rejects --api-mongo-uri without a value", () => {
    expect(() => parseConnectionReportArgs(["--api-mongo-uri"])).toThrow(
      "connection-report --api-mongo-uri requires a value",
    );
  });

  it("withholds config mongo when least privilege is on", () => {
    expect(
      resolveApiMongoUri({
        flag: null,
        leastPrivilege: true,
        envUri: "mongodb://from-env",
        configUri: "mongodb://from-config",
      }),
    ).toBeNull();
    expect(
      resolveApiMongoUri({
        flag: "mongodb://flag",
        leastPrivilege: true,
      }),
    ).toBe("mongodb://flag");
    expect(
      resolveApiMongoUri({
        flag: null,
        leastPrivilege: false,
        envUri: "mongodb://from-env",
        configUri: "mongodb://from-config",
      }),
    ).toBe("mongodb://from-env");
  });

  it("validates --json output against the report schema", () => {
    const report = ConnectionReportSchema.parse({
      generatedAt: "2026-09-21T12:00:00.000Z",
      activityAvailable: true,
      rows: [
        {
          provider: "google",
          state: "actionRequired",
          stateReason: "authorizationRevoked",
          count: 2,
          oldestUpdatedAt: "2026-08-01T00:00:00.000Z",
          newestUpdatedAt: "2026-09-01T00:00:00.000Z",
          activeLast30Days: 1,
          activeLast90Days: 2,
        },
      ],
      staleImporting: [
        {
          id: "aaaaaaaaaaaaaaaaaaaaaaaa",
          provider: "google",
          updatedAt: "2026-09-21T10:00:00.000Z",
        },
      ],
    });
    const json = formatConnectionReport(report, true);
    expect(json).not.toContain("@");
    expect(ConnectionReportSchema.parse(JSON.parse(json))).toEqual(report);
  });
});
