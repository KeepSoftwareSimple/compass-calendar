import { renderHook } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { type AppAccess } from "@web/billing/useAppAccess";
import { BILLING_SUBSCRIBED_TOAST_ID } from "@web/common/constants/toast.constants";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const actualUseAppAccess = (await import("@web/billing/useAppAccess"))
  .useAppAccess;
let isAppAccessMocked = true;
let access: AppAccess = { kind: "open" };

mock.module("@web/billing/useAppAccess", () => ({
  useAppAccess: (...args: Parameters<typeof actualUseAppAccess>) =>
    isAppAccessMocked ? access : actualUseAppAccess(...args),
}));

const { usePlanChangeToasts } = await import("./usePlanChangeToasts");

describe("usePlanChangeToasts", () => {
  let toastMocks: ReturnType<typeof createTestToastPort>["mocks"];

  afterAll(() => {
    isAppAccessMocked = false;
  });

  beforeEach(() => {
    access = { kind: "open" };
    const { port, mocks } = createTestToastPort();
    toastMocks = mocks;
    registerToastPort(port);
  });

  afterEach(() => {
    resetToastPort();
  });

  it("toasts when a trial becomes an active subscription", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: "2099-01-01T00:00:00.000Z",
    };
    const { rerender } = renderHook(() => usePlanChangeToasts());

    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    rerender();

    expect(toastMocks.toast).toHaveBeenCalledWith(
      "You're subscribed",
      expect.objectContaining({ toastId: BILLING_SUBSCRIBED_TOAST_ID }),
    );
  });

  it("does not toast when the status was already active", () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    const { rerender } = renderHook(() => usePlanChangeToasts());
    rerender();

    expect(toastMocks.toast).not.toHaveBeenCalled();
  });
});
