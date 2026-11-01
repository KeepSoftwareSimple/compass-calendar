import type express from "express";
import { accountDeletionKey } from "./user.routes.config";
import { describe, expect, it } from "bun:test";

const requestFor = (userId?: string, ip = "10.0.0.1"): express.Request =>
  ({
    ip,
    session: userId ? { getUserId: () => userId } : undefined,
  }) as unknown as express.Request;

describe("accountDeletionKey", () => {
  it("keys account deletion by the session user, not the client IP", () => {
    expect(accountDeletionKey(requestFor("user-a"))).toBe(
      "account-delete:user-a",
    );
    expect(accountDeletionKey(requestFor("user-b"))).toBe(
      "account-delete:user-b",
    );
  });

  it("gives users behind the same IP separate budgets", () => {
    expect(accountDeletionKey(requestFor("user-a", "1.2.3.4"))).not.toBe(
      accountDeletionKey(requestFor("user-b", "1.2.3.4")),
    );
  });
});
