import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import {
  flushPendingShellToast,
  queuePendingShellToast,
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

  it("delivers a queued info toast on flush", async () => {
    queuePendingShellToast({
      variant: "info",
      message: "No problem, nothing was connected. You can sign in anytime.",
    });

    flushPendingShellToast();

    expect(mocks.info).toHaveBeenCalledWith(
      "No problem, nothing was connected. You can sign in anytime.",
      expect.any(Object),
    );

    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(sessionStorage.getItem("compass.shell.pending-toast")).toBeNull();
  });
});
