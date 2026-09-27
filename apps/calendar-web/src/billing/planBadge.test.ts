import dayjs from "@core/util/date/dayjs";
import { getPlanBadge } from "@web/billing/planBadge";
import { type AppAccess } from "@web/billing/useAppAccess";
import { describe, expect, it } from "bun:test";

const server = (
  status: Extract<AppAccess, { kind: "server" }>["status"],
  trialEndsAt: string | null = null,
): AppAccess => ({ kind: "server", status, isReadOnly: false, trialEndsAt });

describe("getPlanBadge", () => {
  it("reports nothing for an open install", () => {
    expect(getPlanBadge({ kind: "open" })).toBeNull();
  });

  it("reports nothing for an account with no billing state", () => {
    expect(getPlanBadge(server("none"))).toBeNull();
  });

  it("labels an active subscription Premium", () => {
    expect(getPlanBadge(server("active"))).toEqual({
      label: "Premium",
      tone: "premium",
    });
  });

  it("counts down the days left on a trial", () => {
    const endsAt = dayjs().add(3, "day").toISOString();

    expect(getPlanBadge(server("trialing", endsAt))).toEqual({
      label: "Trial · 3d",
      tone: "trial",
    });
  });

  it("reads the final trial day as Last day", () => {
    const endsAt = dayjs().subtract(1, "hour").toISOString();

    expect(getPlanBadge(server("trialing", endsAt))).toEqual({
      label: "Trial · Last day",
      tone: "trial",
    });
  });

  it("falls back to a bare Trial label with no end date", () => {
    expect(getPlanBadge(server("trialing", null))).toEqual({
      label: "Trial",
      tone: "trial",
    });
  });

  it("flags a failed payment", () => {
    expect(getPlanBadge(server("past_due"))).toEqual({
      label: "Payment due",
      tone: "attention",
    });
  });

  it("labels an account that has not checked out yet Free", () => {
    expect(getPlanBadge(server("awaiting_checkout"))).toEqual({
      label: "Free",
      tone: "neutral",
    });
  });

  it("labels both spent states Expired", () => {
    for (const status of ["expired", "canceled"] as const) {
      expect(getPlanBadge(server(status))).toEqual({
        label: "Expired",
        tone: "attention",
      });
    }
  });
});
