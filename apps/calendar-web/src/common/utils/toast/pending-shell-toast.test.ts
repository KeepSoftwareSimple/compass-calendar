import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import {
  flushPendingShellToast,
  queuePendingShellToast,
  registerPendingShellToastHost,
  resetPendingShellToastForTests,
} from "@web/common/utils/toast/pending-shell-toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { beforeEach, describe, expect, it } from "bun:test";

describe("pending-shell-toast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    registerToastPort(port);
    mocks.info.mockClear();
    mocks.error.mockClear();
    resetPendingShellToastForTests();
  });

  it("delivers a queued info toast on flush", () => {
    queuePendingShellToast({
      variant: "info",
      message: "No problem, nothing was connected. You can sign in anytime.",
    });

    flushPendingShellToast();

    expect(mocks.info).toHaveBeenCalledWith(
      "No problem, nothing was connected. You can sign in anytime.",
      expect.any(Object),
    );
  });

  it("delivers a toast queued after the host mounted", () => {
    const unregister = registerPendingShellToastHost();

    try {
      queuePendingShellToast({
        variant: "error",
        message: "Connection failed",
      });
      expect(mocks.error).toHaveBeenCalledWith(
        "Connection failed",
        expect.any(Object),
      );
    } finally {
      unregister();
    }
  });

  it("keeps the payload briefly for a StrictMode remount", async () => {
    queuePendingShellToast({
      variant: "info",
      message: "No problem, nothing was connected. You can sign in anytime.",
    });

    flushPendingShellToast();
    flushPendingShellToast();

    expect(mocks.info).toHaveBeenCalledTimes(2);

    await new Promise((resolve) => setTimeout(resolve, 800));
    flushPendingShellToast();

    expect(mocks.info).toHaveBeenCalledTimes(2);
  });
});
