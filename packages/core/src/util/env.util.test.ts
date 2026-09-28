import { NodeEnv } from "@core/constants/core.constants";
import {
  isAppleOffered,
  isBookingEnabled,
  isDev,
  isNonProduction,
  isSupertokensDashboardEnabled,
} from "@core/util/env.util";
import { describe, expect, it } from "bun:test";

describe("isDev", () => {
  it("is true only for development", () => {
    expect(isDev(NodeEnv.Development)).toBe(true);
    expect(isDev(NodeEnv.Staging)).toBe(false);
    expect(isDev(NodeEnv.Production)).toBe(false);
    expect(isDev(NodeEnv.Test)).toBe(false);
  });
});

describe("isBookingEnabled", () => {
  it("is on in every runtime environment", () => {
    expect(isBookingEnabled(NodeEnv.Development)).toBe(true);
    expect(isBookingEnabled(NodeEnv.Staging)).toBe(true);
    expect(isBookingEnabled(NodeEnv.Test)).toBe(true);
    expect(isBookingEnabled(NodeEnv.Production)).toBe(true);
    expect(isBookingEnabled("production")).toBe(true);
  });
});

describe("isNonProduction", () => {
  it("is false only for production", () => {
    expect(isNonProduction(NodeEnv.Development)).toBe(true);
    expect(isNonProduction(NodeEnv.Staging)).toBe(true);
    expect(isNonProduction(NodeEnv.Test)).toBe(true);
    expect(isNonProduction(NodeEnv.Production)).toBe(false);
  });
});

describe("isSupertokensDashboardEnabled", () => {
  it("is on in development, staging, and tests", () => {
    expect(isSupertokensDashboardEnabled(NodeEnv.Development)).toBe(true);
    expect(isSupertokensDashboardEnabled(NodeEnv.Staging)).toBe(true);
    expect(isSupertokensDashboardEnabled(NodeEnv.Test)).toBe(true);
  });

  it("is off in production", () => {
    expect(isSupertokensDashboardEnabled(NodeEnv.Production)).toBe(false);
    expect(isSupertokensDashboardEnabled("production")).toBe(false);
  });
});

describe("isAppleOffered", () => {
  it("is on in development, staging, and tests", () => {
    expect(isAppleOffered(NodeEnv.Development)).toBe(true);
    expect(isAppleOffered(NodeEnv.Staging)).toBe(true);
    expect(isAppleOffered(NodeEnv.Test)).toBe(true);
  });

  it("is off in production until Apple calendar is supported there", () => {
    expect(isAppleOffered(NodeEnv.Production)).toBe(false);
    expect(isAppleOffered("production")).toBe(false);
  });
});
